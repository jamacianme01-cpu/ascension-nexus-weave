import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { parseDelivery, type ObjectiveDelivery } from "../result-model";

const ORDINAL = 100;
const LABEL = "GOVERNED_RUNTIME_RESULT";
const MODEL = "governed-runtime";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function branchTitle(branch: Record<string, unknown>): string {
  const names: Record<string, string> = {
    single_pass_construct: "Create in one pass",
    staged_construct: "Build and check in stages",
    minimal_seeded_construct: "Start with a small working seed",
  };
  const approach = String(branch["approach"] ?? "");
  return names[approach] ?? String((branch["name"] ?? branch["pathway"] ?? approach) || "Selected pathway");
}

function governedDelivery(run: {
  objective: string;
  result: Json | null;
}): ObjectiveDelivery | null {
  if (run.result === null) return null;

  const result = record(run.result);
  if (!Object.keys(result).length) return null;

  const planning = record(result["objective_planning"]);
  const selected = record(planning["selected_branch"]);
  const actions = strings(selected["actions"]);
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

  const body: string[] = [run.objective];
  if (Object.keys(selected).length) body.push(`Selected future: ${branchTitle(selected)}`);
  if (actions.length) body.push(`Actions:\n${actions.map((action) => `- ${action}`).join("\n")}`);
  if (receipts.length) {
    body.push(
      `Recorded artifacts:\n${receipts
        .map(
          (file) =>
            `- ${file.path}${file.bytes !== null ? ` (${file.bytes} bytes)` : ""}${
              file.sha256 ? ` · sha256 ${file.sha256}` : ""
            }`,
        )
        .join("\n")}`,
    );
  }

  const state: string[] = [];
  if (typeof result["governed_status"] === "string") state.push(result["governed_status"]);
  if (typeof result["transaction"] === "string") state.push(`transaction ${result["transaction"]}`);
  if (typeof result["autosync_verdict"] === "string") state.push(`AutoSync ${result["autosync_verdict"]}`);
  if (typeof result["runtime_revision"] === "number") state.push(`revision ${result["runtime_revision"]}`);
  if (state.length) body.push(`Governed runtime: ${state.join(" · ")}`);

  const titleSource =
    typeof result["objective_text"] === "string" && result["objective_text"].trim()
      ? result["objective_text"].trim()
      : run.objective.trim();

  return parseDelivery({
    kind: "recommendation",
    title: titleSource.slice(0, 200) || "ASCENSION result",
    body: body.join("\n\n").slice(0, 40000),
    files: [],
    limitations: receipts.length
      ? [
          "The governed runtime recorded artifact receipts, but the hosted queue does not yet carry the artifact file bodies for download.",
        ]
      : [],
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

  const current = await read();
  const delivery = governedDelivery(run);

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
