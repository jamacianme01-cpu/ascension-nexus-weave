import type { Json } from "@/integrations/supabase/types";
import { assessResult, notProducedMessage, parseDelivery, type ObjectiveDelivery } from "../result-model";

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

export function artifactFiles(value: unknown): { name: string; content: string }[] {
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

export function governedDelivery(
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
    transportedFiles.find((file) => /^ascension_result\.md$/i.test(file.name)) ??
    transportedFiles.find((file) => /^document\.md$/i.test(file.name)) ??
    transportedFiles.find(
      (file) =>
        !/^(README\.md|governed_objective\.json|artifact_manifest\.json|verification\.json|acceptance_result\.json|metadata\.json|lineage\.json|knowledgeform_.*\.md)$/i.test(file.name),
    ) ??
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
  const answerFile = assessment.files.find((file) => /\.(md|txt)$/i.test(file.name));
  const body =
    assessment.kind === "app"
      ? "Your runnable app is ready below. Download the HTML file and open it in your browser."
      : assessment.kind === "drawing"
        ? "Your drawing is shown below. Download the SVG to keep or edit it."
        : primaryOk && /\.(md|txt)$/i.test(primary.name)
          ? primary.content.trim()
          : answerFile
            ? answerFile.content.trim()
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
    kind: assessment.kind === "answer" || assessment.kind === "design" ? "answer" : "artifact",
    title: titleSource.slice(0, 200) || "ASCENSION result",
    body: body.slice(0, 40000),
    files: assessment.kind === "answer" || assessment.kind === "design" ? [] : assessment.files,
    limitations: [
      ...answerLimitations,
      ...(missingReceipts.length
        ? [`${missingReceipts.length} recorded file${missingReceipts.length === 1 ? " has" : "s have"} a receipt but ${missingReceipts.length === 1 ? "its" : "their"} contents have not reached the website yet.`]
        : []),
    ],
  });
}

export async function externalProductDraft(
  run: {
    objective: string;
    result: Json | null;
    status?: string;
  },
  transportedFiles: { name: string; content: string }[],
): Promise<ObjectiveDelivery> {
  const { callZai } = await import("./zai.server");

  const artifactContext = transportedFiles
    .filter((file) => !/^knowledgeform_/i.test(file.name))
    .slice(0, 6)
    .map((file) => `FILE: ${file.name}\n${file.content.slice(0, 12000)}`)
    .join("\n\n");

  const system = [
    "You are the external product-result generator for the ASCENSION interface.",
    "Write a useful user-facing draft now. ASCENSION governed execution may still be pending; available artifacts can be receipts, plans, Knowledge Forms, or scaffolds.",
    "Do not claim you physically built, tested, verified, persisted, or governed anything.",
    "Return exactly one JSON object with keys: kind, title, body, files, limitations.",
    'kind must be "answer" or "artifact".',
    "For ordinary questions or product/invention requests, give a substantive direct result in body.",
    "For app/code requests, include complete runnable source files.",
    "For drawing/image/diagram requests, include an SVG file when the request can be satisfied as vector art.",
    "For product/invention creation requests, create a substantive design/specification rather than a receipt, token list, or plan to make one.",
    "files must be an array of objects with name and content. Use [] when no download is needed.",
    "limitations must truthfully state what remains unverified or conceptual.",
    "Never return a Knowledge Form, execution receipt, generic ASCENSION architecture explanation, or placeholder.",
  ].join(" ");

  const user = [
    `OBJECTIVE:\n${run.objective}`,
    `GOVERNED RUNTIME STATUS: ${run.status ?? "unknown"} (do not claim this draft is verified)`,
    artifactContext
      ? `\nGOVERNED RUNTIME ARTIFACTS / CONTEXT:\n${artifactContext}`
      : "\nNo usable runtime artifact content was transported.",
    "\nProduce the requested user-facing result now.",
  ].join("\n");

  const generated = await callZai({
    system,
    user,
    knowledgeQuery: run.objective,
    temperature: 0.25,
  });

  const candidate =
    generated.json ??
    ({
      kind: "answer",
      title: run.objective.slice(0, 200) || "ASCENSION result",
      body: generated.text.trim(),
      files: [],
      limitations: [],
    } as Record<string, unknown>);

  const parsed = parseDelivery(candidate);
  const check = assessResult(run.objective, parsed.body, parsed.files);
  if (!check.produced || parsed.kind === "not_produced")
    throw new Error(
      `the external engine did not return a substantive result${check.reason ? ` (${check.reason})` : ""}`,
    );

  return {
    ...parsed,
    files: check.kind === "answer" || check.kind === "design" ? [] : check.files,
    limitations: [
      ...parsed.limitations,
      "External model draft. ASCENSION governed execution, verification, and persistence remain separate.",
    ],
  };
}


/* ------------------------------------------------------------------ */
/* Delivery resolution shared by the signed-in and guest paths.        */
/* ------------------------------------------------------------------ */

export const TERMINAL_STATUSES = new Set(["verified", "rejected", "failed"]);
export const DRAFT_ORDINAL = 102;
export const DRAFT_LABEL = "ZAI_EXTERNAL_RESULT";
/** How long a verified run waits for its separately transported files. */
export const ARTIFACT_GRACE_MS = 90_000;
/** A draft left "running" longer than this is considered abandoned. */
export const DRAFT_STALE_MS = 180_000;

export interface ResolvedDelivery {
  created_at: string;
  status: "running" | "completed";
  response_payload: ObjectiveDelivery | null;
  error: string | null;
  engine_model: string | null;
  engine_label: string;
  /** Plain-language description of what is still pending. */
  note: string | null;
  /** "governed" projection of the runtime result, or the external unverified draft. */
  source: "governed" | "external_draft" | null;
}

export interface DraftRow {
  status: string;
  created_at: string;
  response_payload: unknown;
  error: string | null;
  engine_model: string | null;
  source_key: string | null;
}

export interface DraftStore {
  claim(sourceKey: string, expectedCreatedAt: string | null): Promise<boolean>;
  complete(sourceKey: string, payload: ObjectiveDelivery): Promise<void>;
  fail(sourceKey: string, message: string): Promise<void>;
}

export interface DeliveryRun {
  id: string;
  objective: string;
  status: string;
  result: Json | null;
  completed_at: string | null;
  updated_at?: string | null;
  created_at: string;
}

/** Stable identity of the transported artifacts a projection was made from. */
export function artifactSourceKey(runId: string, files: { name: string; content: string }[]) {
  let h = 2166136261;
  const text = files.map((f) => `${f.name}:${f.content.length}:${f.content}`).join("\u0000");
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return `${runId}:${files.length}:${h.toString(16)}`;
}

export function draftFromStage(stage: unknown): DraftRow | null {
  const s = record(stage);
  if (!Object.keys(s).length) return null;
  return {
    status: String(s["status"] ?? ""),
    created_at: String(s["created_at"] ?? ""),
    response_payload: s["response_payload"] ?? null,
    error: typeof s["error"] === "string" ? s["error"] : null,
    engine_model: typeof s["engine_model"] === "string" ? s["engine_model"] : null,
    source_key:
      typeof record(s["request_payload"])["source_key"] === "string"
        ? (record(s["request_payload"])["source_key"] as string)
        : null,
  };
}

type DraftGenerator = typeof externalProductDraft;

/**
 * Decide what the answer panel shows. Never terminal while the governed run is
 * still running; never sticky when later artifacts arrive (the projection is
 * recomputed from the current artifacts every read, which is cheap and makes
 * no model call); the external draft is generated at most once per artifact
 * set because a stage row must be claimed first.
 */
export async function resolveDelivery(args: {
  run: DeliveryRun;
  artifactStage: { status: string; response_payload: unknown } | null;
  draft: DraftRow | null;
  store: DraftStore;
  retry: boolean;
  now?: number;
  generate?: DraftGenerator;
}): Promise<ResolvedDelivery> {
  const { run, artifactStage, draft, store, retry } = args;
  const now = args.now ?? Date.now();
  const generate = args.generate ?? externalProductDraft;
  const base = {
    created_at: run.completed_at ?? run.updated_at ?? run.created_at,
    error: null,
    engine_model: "governed-runtime",
    engine_label: LABEL,
    source: null,
  } as const;
  const pending = (note: string, extra: Partial<ResolvedDelivery> = {}): ResolvedDelivery => ({
    ...base,
    status: "running",
    response_payload: null,
    note,
    ...extra,
  });

  // The user-facing draft can start as soon as the objective is accepted.
  // The governed runtime continues independently and can supersede this draft
  // if it later transports the actual requested result.
  const files =
    artifactStage?.status === "completed" ? artifactFiles(artifactStage.response_payload) : [];
  const governed = run.status === "verified" ? governedDelivery(run, files) : null;
  if (governed && governed.kind !== "not_produced") {
    return { ...base, status: "completed", response_payload: governed, note: null, source: "governed" };
  }

  // The governed result is not the thing that was asked for. Ask the external
  // engine for a clearly unverified draft — once per artifact set.
  const sourceKey = artifactSourceKey(run.id, files);
  const draftBase = { ...base, engine_label: DRAFT_LABEL, engine_model: draft?.engine_model ?? null };
  const sameSource = draft?.source_key === sourceKey;

  if (draft?.status === "completed" && sameSource) {
    try {
      return {
        ...draftBase,
        created_at: draft.created_at,
        status: "completed",
        response_payload: parseDelivery(draft.response_payload),
        note: null,
        source: "external_draft",
      };
    } catch {
      // A stored draft that no longer validates is regenerated below.
    }
  }
  const running = draft?.status === "running";
  const fresh = running && now - Date.parse(draft!.created_at) < DRAFT_STALE_MS;
  if (running && fresh) {
    return pending("Your governed result is not the requested output. Writing an unverified draft…", {
      engine_label: DRAFT_LABEL,
    });
  }
  const failed = (message: string): ResolvedDelivery => ({
    ...draftBase,
    status: "completed",
    response_payload: governed,
    error: `The external result engine failed: ${message}`,
    note: null,
    source: "governed",
  });
  if (draft?.status === "failed" && sameSource && !retry) return failed(draft.error ?? "unknown error");

  const claimed = await store.claim(sourceKey, draft ? draft.created_at : null);
  if (!claimed) {
    return pending("An unverified draft is being prepared…", { engine_label: DRAFT_LABEL });
  }
  try {
    const produced = await generate(run, files);
    await store.complete(sourceKey, produced);
    return {
      ...draftBase,
      created_at: new Date(now).toISOString(),
      status: "completed",
      response_payload: produced,
      note: null,
      source: "external_draft",
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await store.fail(sourceKey, message).catch(() => undefined);
    return failed(message);
  }
}

/** Signed-in path: stage writes go through the server-only admin client. */
export async function adminDraftStore(runId: string): Promise<DraftStore> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = () => supabaseAdmin.from("ascension_run_stages");
  return {
    async claim(sourceKey, expectedCreatedAt) {
      if (expectedCreatedAt === null) {
        const { error } = await table().insert({
          request_id: runId,
          ordinal: DRAFT_ORDINAL,
          stage: "external_result",
          engine_label: DRAFT_LABEL,
          status: "running",
          request_payload: { source_key: sourceKey, attempts: 1 },
        });
        if (error?.code === "23505") return false;
        if (error) throw new Error(error.message);
        return true;
      }
      const stale = new Date(Date.now() - DRAFT_STALE_MS).toISOString();
      const { data, error } = await table()
        .update({
          status: "running",
          error: null,
          response_payload: null,
          response_text: null,
          completed_at: null,
          created_at: new Date().toISOString(),
          request_payload: { source_key: sourceKey },
        })
        .eq("request_id", runId)
        .eq("ordinal", DRAFT_ORDINAL)
        .eq("created_at", expectedCreatedAt)
        .or(`status.neq.running,created_at.lt.${stale}`)
        .select("id");
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) === 1;
    },
    async complete(sourceKey, payload) {
      const { error } = await table()
        .update({
          status: "completed",
          response_payload: payload as unknown as Json,
          response_text: payload.body,
          engine_model: "external",
          completed_at: new Date().toISOString(),
        })
        .eq("request_id", runId)
        .eq("ordinal", DRAFT_ORDINAL)
        .eq("status", "running")
        .eq("request_payload->>source_key", sourceKey);
      if (error) throw new Error(error.message);
    },
    async fail(sourceKey, message) {
      const { error } = await table()
        .update({ status: "failed", error: message.slice(0, 2000), completed_at: new Date().toISOString() })
        .eq("request_id", runId)
        .eq("ordinal", DRAFT_ORDINAL)
        .eq("status", "running")
        .eq("request_payload->>source_key", sourceKey);
      if (error) throw new Error(error.message);
    },
  };
}
