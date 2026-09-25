/** Consumer projections of recorded runs. No projection awards verification. */
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function branchTitle(value: unknown): string {
  const b = record(value);
  const names: Record<string, string> = {
    single_pass_construct: "Create in one pass",
    staged_construct: "Build and check in stages",
    minimal_seeded_construct: "Start with a small working seed",
  };
  return (
    names[String(b["approach"])] ??
    String(
      b["pathway"] ??
        b["name"] ??
        b["approach"] ??
        b["branch_id"] ??
        b["id"] ??
        "Published pathway",
    )
  );
}

export function planningFor(result: unknown) {
  const p = record(record(result)["objective_planning"]);
  const branches = Array.isArray(p["branches"]) ? p["branches"].map(record) : [];
  const selected = record(p["selected_branch"]);
  return {
    branches,
    selected,
    elements: Array.isArray(p["meaning_elements"]) ? p["meaning_elements"].map(record) : [],
  };
}

export function governedPersisted(run: {
  engine?: string | null;
  status: string;
  result: unknown;
}): boolean {
  const r = record(run.result);
  return (
    run.engine === "governed_runtime" &&
    run.status === "verified" &&
    r["transaction"] === "PERSISTED" &&
    r["autosync_verdict"] === "VERIFIED" &&
    record(r["publication"])["delta_in_persisted_ledger"] === true
  );
}

export function receiptFiles(
  result: unknown,
): { name: string; bytes: number | null; sha256: string | null }[] {
  const receipts = record(result)["execution_receipts"];
  if (!Array.isArray(receipts)) return [];
  return receipts.flatMap((r) => {
    const files = record(r)["files"];
    return Array.isArray(files)
      ? files.map((file) => {
          const f = record(file);
          return {
            name:
              typeof f["path"] === "string"
                ? f["path"].split(/[\\/]/).at(-1)!
                : "Recorded artifact",
            bytes: typeof f["bytes"] === "number" ? f["bytes"] : null,
            sha256: typeof f["sha256"] === "string" ? f["sha256"] : null,
          };
        })
      : [];
  });
}

export interface ObjectiveDelivery {
  kind: "answer" | "recommendation" | "artifact" | "not_produced";
  title: string;
  body: string;
  files: { name: string; content: string }[];
  limitations: string[];
}

/** Validate external output before displaying or offering it for download. */
export function parseDelivery(value: unknown): ObjectiveDelivery {
  const v = record(value);
  if (
    !["answer", "recommendation", "artifact", "not_produced"].includes(String(v["kind"])) ||
    typeof v["title"] !== "string" ||
    !v["title"].trim() ||
    v["title"].length > 200 ||
    typeof v["body"] !== "string" ||
    !v["body"].trim() ||
    v["body"].length > 40000 ||
    !Array.isArray(v["files"]) ||
    v["files"].length > 8 ||
    !Array.isArray(v["limitations"]) ||
    v["limitations"].some((x) => typeof x !== "string")
  ) {
    throw new Error("The answer engine returned an incomplete result. Retry this result.");
  }
  const normalizedBody = v["body"].toLowerCase();
  const cannedArchitectureMarkers = [
    "the knowledgeverse has mapped",
    "**identity phase:**",
    "**development phase:**",
    "**emergence phase:**",
    "objective's unique chromosome",
    "verified deltas to guide natural evolution",
  ];
  const cannedMarkerCount = cannedArchitectureMarkers.filter((marker) =>
    normalizedBody.includes(marker),
  ).length;
  if (cannedMarkerCount >= 2) {
    throw new Error(
      "The answer engine returned a generic architecture template instead of answering the objective. Retry this result.",
    );
  }
  const names = new Set<string>();
  const files = v["files"].map((raw) => {
    const f = record(raw);
    if (
      typeof f["name"] !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(f["name"]) ||
      f["name"].includes("..") ||
      names.has(f["name"].toLowerCase()) ||
      typeof f["content"] !== "string" ||
      !f["content"].trim() ||
      f["content"].length > 100000
    ) {
      throw new Error("The answer engine returned an invalid file.");
    }
    names.add(f["name"].toLowerCase());
    return { name: f["name"], content: f["content"] };
  });
  if (v["kind"] === "not_produced" && files.length)
    throw new Error("An unproduced result cannot carry downloadable files.");
  if (v["kind"] === "artifact" && !files.length)
    throw new Error("The created result did not include a file.");
  return {
    kind: v["kind"] as ObjectiveDelivery["kind"],
    title: v["title"],
    body: v["body"],
    files,
    limitations: v["limitations"] as string[],
  };
}

/* ------------------------------------------------------------------ */
/* Result honesty: what counts as an actual user result.               */
/* ------------------------------------------------------------------ */

export type RequestedKind = "drawing" | "app" | "answer";

export function requestedKind(objective: string): RequestedKind {
  const o = objective.toLowerCase();
  if (/\b(draw|drawing|sketch|diagram|illustrat\w*|render|picture|image|blueprint|schematic)\b/.test(o))
    return "drawing";
  if (/\b(app|application|website|web ?site|program|script|code|software|game|tool|bot)\b/.test(o))
    return "app";
  return "answer";
}

const SCAFFOLD_LINE =
  /^(#+\s*)?(knowledge form|selected future|actions?:|verification receipts?|governed runtime|recorded artifact|transaction|autosync|revision|meaning elements?|tokens?|chromosome|genesis|lineage|phenotype|sid|id|branch|approach|pathway)\b/i;
const APPROACH_TOKEN = /\b(single_?pass_?construct|staged_?construct|minimal_?seeded_?construct|singlepassconstruct|stagedconstruct|minimalseededconstruct)\b/i;

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Why a piece of text is not a real result, or null when it is substantive. */
export function scaffoldReason(text: string, objective: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "it is empty";
  if (/^\s*#*\s*knowledge form\b/im.test(trimmed)) return "it is a Knowledge Form, not the requested result";
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const content = lines.filter(
    (l) => !SCAFFOLD_LINE.test(l.replace(/^[-*•]\s*/, "")) && !APPROACH_TOKEN.test(l) && !/^[a-f0-9]{16,}$/i.test(l),
  );
  const shortLines = content.filter((l) => l.replace(/^[-*•\d.)\s]+/, "").split(/\s+/).length <= 3);
  if (content.length && shortLines.length / content.length >= 0.6 && !/```|<svg|<html|function |=>|def |class /i.test(trimmed))
    return "it is a token list, not the requested result";
  const obj = normalize(objective);
  const rest = normalize(content.join(" ")).replace(obj, " ").replace(/\s+/g, " ").trim();
  if (rest.length < 60) return "it only repeats the request or lists a plan, path label or receipt";
  return null;
}

export interface ResultAssessment {
  produced: boolean;
  kind: RequestedKind;
  reason: string | null;
  files: { name: string; content: string }[];
}

const CODE_FILE = /\.(html?|js|jsx|ts|tsx|py|java|kt|swift|go|rs|rb|php|c|cpp|cs|sh|vue|svelte)$/i;
const INTERNAL_FILE = /^(README\.md|governed_objective\.json|artifact_manifest\.json|verification\.json|knowledgeform_.*\.md)$/i;

/**
 * Decide whether delivered text/files are the thing the user asked for.
 * A verified run status or a byte receipt never makes this true by itself.
 */
export function assessResult(
  objective: string,
  body: string,
  files: { name: string; content: string }[],
): ResultAssessment {
  const kind = requestedKind(objective);
  const realFiles = files.filter((f) => {
    if (INTERNAL_FILE.test(f.name)) return false;
    if (/\.svg$/i.test(f.name)) return /<svg[\s>]/i.test(f.content) && /<(path|line|rect|circle|polyline|polygon|ellipse|g)\b/i.test(f.content);
    return scaffoldReason(f.content, objective) === null;
  });
  const bodyOk = scaffoldReason(body, objective) === null;
  if (kind === "drawing") {
    const drawings = realFiles.filter((f) => /\.svg$/i.test(f.name));
    if (drawings.length) return { produced: true, kind, reason: null, files: realFiles };
    return { produced: false, kind, reason: "no drawing file was returned", files: [] };
  }
  if (kind === "app") {
    const code = realFiles.filter((f) => CODE_FILE.test(f.name));
    if (code.length || (bodyOk && /```[\s\S]+```/.test(body)))
      return { produced: true, kind, reason: null, files: realFiles };
    return {
      produced: false,
      kind,
      reason: realFiles.length || bodyOk ? "no app code was returned" : scaffoldReason(files[0]?.content ?? body, objective),
      files: [],
    };
  }
  if (bodyOk || realFiles.length) return { produced: true, kind, reason: null, files: realFiles };
  return { produced: false, kind, reason: scaffoldReason(body, objective), files: [] };
}

export function notProducedMessage(kind: RequestedKind) {
  return kind === "drawing"
    ? "The requested drawing has not been produced."
    : kind === "app"
      ? "The requested app has not been produced."
      : "The requested answer has not been produced.";
}
