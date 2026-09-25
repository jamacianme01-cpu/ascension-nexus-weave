import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { assessResult, notProducedMessage, parseDelivery } from "../result-model";

const ORDINAL = 100;
const ARTIFACT_ORDINAL = 101;
// V2: projections are assessed so plans/Knowledge Forms/receipts are never a user result.
const LABEL = "GOVERNED_RUNTIME_RESULT_V2";
const MODEL = "governed-runtime";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function artifactFiles(value: unknown): { name: string; content: string }[] {
  const payload = record(value);
  if (!Array.isArray(payload["files"])) return [];
  const names = new Set<string>();
  return payload["files"].flatMap((raw) => {
    const file = record(raw);
    const name = typeof file["name"] === "string" ? file["name"].trim() : "";
    const content = typeof file["content"] === "string" ? file["content"] : "";
    const key = name.toLowerCase();
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name) ||
      name.includes("..") ||
      !content ||
      content.length > 100000 ||
      names.has(key)
    ) {
      return [];
    }
    names.add(key);
    return [{ name, content }];
  });
}

function governedDelivery(
  run: {
    objective: string;
    result: Json | null;
  },
  transportedFiles: { name: string; content: string }[],
) {
  if (run.result === null) return null;

  const result = record(run.result);
  if (!Object.keys(result).length) return null;

  const receipts = Array.isArray(result["execution_receipts"])
    ? result["execution_receipts"].flatMap((rawReceipt) => {
        const receipt = record(rawReceipt);
        const files = Array.isArray(receipt["files"]) ? receipt["files"] : [];
        return files.map((rawFile) => {
          const file = record(rawFile);
          return {
            path: typeof file["path"] === "string" ? file["path"] : "Recorded artifact",
            bytes: typeof file["bytes"] === "number" ? file["bytes"] : null,
            sha256: typeof file["sha256"] === "string" ? file["sha256"] : null,
          };
        });
      })
    : [];

  const titleSource =
    typeof result["objective_text"] === "string" && result["objective_text"].trim()
      ? result["objective_text"].trim()
      : run.objective.trim();

  const requestedOutput = record(result["requested_output"]);
  const primaryName = typeof requestedOutput["primary_artifact"] === "string"
    ? requestedOutput["primary_artifact"] : "";
  const primary =
    transportedFiles.find((file) => file.name === primaryName) ??
    transportedFiles.find((file) => !/^(README\.md|governed_objective\.json)$/i.test(file.name)) ??
    null;
  const assessment = assessResult(run.objective, primary?.content ?? "", transportedFiles);

  if (!assessment.produced) {
    const lines = [
      notProducedMessage(assessment.kind),
      `The ASCENSION runtime finished this run, but what it returned is not the result you asked for${assessment.reason ? ` (${assessment.reason})` : ""}.`,
    ];
    return parseDelivery({
      kind: "not_produced",
      title: titleSource.slice(0, 200) || "ASCENSION result",
      body: lines.join("\n\n"),
      files: [],
      limitations: receipts.length
        ? [
            `The runtime's file receipt${receipts.length === 1 ? "" : "s"} confirm${receipts.length === 1 ? "s" : ""} stored bytes only. ${receipts.length === 1 ? "It does" : "They do"} not show the objective was accomplished.`,
          ]
        : [],
    });
  }

  const primaryOk = primary && assessment.files.some((f) => f.name === primary.name);
  const body =
    assessment.kind === "app"
      ? "Your runnable app is ready below. Download the HTML file and open it in your browser."
      : assessment.kind === "drawing"
        ? "Your drawing is shown below. Download the SVG to keep or edit it."
        : primaryOk && /\.(md|txt)$/i.test(primary.name)
          ? primary.content.trim()
          : "Your result is ready to download below.";

  const transportedNames = new Set(assessment.files.map((file) => file.name.toLowerCase()));
  const missingReceipts = receipts.filter((receipt) => {
    const basename = receipt.path.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
    return basename && basename !== "governed_objective.json" && !transportedNames.has(basename);
  });

  const answerLimitations = requestedOutput["truth_status"] === "UNVERIFIED_MODEL_DRAFT"
    ? ["A local model drafted this answer. Its factual claims have not been independently checked."]
    : [];

  return parseDelivery({
    kind: assessment.kind === "answer" ? "answer" : "artifact",
    title: titleSource.slice(0, 200) || "ASCENSION result",
    body: body.slice(0, 40000),
    files: assessment.kind === "answer" ? [] : assessment.files,
    limitations: [
      ...answerLimitations,
      ...(missingReceipts.length
        ? [`${missingReceipts.length} recorded file${missingReceipts.length === 1 ? " has" : "s have"} a receipt but ${missingReceipts.length === 1 ? "its" : "their"} contents have not reached the website yet.`]
        : []),
    ],
  });
}

export async function prepareDelivery(
  run: {
    id: string;
    objective: string;
    evidence: Json | null;
    constraints: Json | null;
    result: Json | null;
  },
  retry: boolean,
) {
  void retry;
  const table = () => supabaseAdmin.from("ascension_run_stages");
  const read = async () => {
    const { data, error } = await table()
      .select("status, response_payload, error, engine_model, engine_label, created_at")
      .eq("request_id", run.id)
      .eq("ordinal", ORDINAL)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  };
  const readArtifacts = async () => {
    const { data, error } = await table()
      .select("status, response_payload")
      .eq("request_id", run.id)
      .eq("ordinal", ARTIFACT_ORDINAL)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  };

  const [current, artifactStage] = await Promise.all([read(), readArtifacts()]);
  const files =
    artifactStage?.status === "completed" ? artifactFiles(artifactStage.response_payload) : [];

  // Once the governed projection is complete, leave it alone until artifact
  // transport arrives. This avoids rewriting the same result on every poll.
  if (current?.status === "completed" && current.engine_label === LABEL && files.length === 0)
    return current;

  const delivery = governedDelivery(run, files);

  if (delivery) {
    const completedAt = new Date().toISOString();
    if (current) {
      const { error } = await table()
        .update({
          status: "completed",
          response_payload: delivery as unknown as Json,
          response_text: delivery.body,
          error: null,
          engine_label: LABEL,
          engine_model: MODEL,
          duration_ms: 0,
          completed_at: completedAt,
        })
        .eq("request_id", run.id)
        .eq("ordinal", ORDINAL);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await table().insert({
        request_id: run.id,
        ordinal: ORDINAL,
        stage: "user_result",
        status: "completed",
        response_payload: delivery as unknown as Json,
        response_text: delivery.body,
        engine_label: LABEL,
        engine_model: MODEL,
        duration_ms: 0,
        completed_at: completedAt,
      });
      if (error?.code !== "23505" && error) throw new Error(error.message);
    }
    return read();
  }

  if (current?.status === "completed") return current;

  if (current) {
    if (current.status !== "running" || current.error || current.engine_label !== LABEL) {
      const { error } = await table()
        .update({
          status: "running",
          error: null,
          completed_at: null,
          engine_label: LABEL,
          engine_model: MODEL,
          created_at: new Date().toISOString(),
        })
        .eq("request_id", run.id)
        .eq("ordinal", ORDINAL);
      if (error) throw new Error(error.message);
    }
    return read();
  }

  const { error } = await table().insert({
    request_id: run.id,
    ordinal: ORDINAL,
    stage: "user_result",
    status: "running",
    engine_label: LABEL,
    engine_model: MODEL,
  });
  if (error?.code !== "23505" && error) throw new Error(error.message);
  return read();
}
