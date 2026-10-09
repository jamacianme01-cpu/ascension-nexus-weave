import type { ObjectivePathway } from "./result-model";
import type { DesignPart } from "./parts-model";

export const SAVED_QUESTIONS = "ascension.saved-questions.v1";
export const BLEND_SELECTION = "ascension.blend-selection.v1";
const uuid = /^[a-f0-9-]{36}$/i;
type StoragePort = Pick<Storage, "getItem" | "setItem">;
export type SavedQuestion = {
  id: string; objective: string; created_at: string; access: "auth" | "guest";
  guestToken?: string; parentId?: string | undefined;
};
export type BlendInput = {
  key: string; requestId: string; objective: string; pathwayId: string; pathwayLabel: string;
  kind: "pathway" | "part" | "variable"; name: string; description: string;
};

function storage(): StoragePort | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}
export function readSavedQuestions(port = storage()): SavedQuestion[] {
  try {
    const raw: unknown = JSON.parse(port?.getItem(SAVED_QUESTIONS) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw.filter((item): item is SavedQuestion => {
      if (!item || typeof item !== "object" || !uuid.test(item.id) || seen.has(item.id) ||
          typeof item.objective !== "string" || !item.objective.trim() ||
          !Number.isFinite(Date.parse(item.created_at)) ||
          !["guest", "auth"].includes(item.access) ||
          (item.access === "guest" && !uuid.test(item.guestToken ?? ""))) return false;
      seen.add(item.id); return true;
    }).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  } catch { return []; }
}
export function rememberQuestion(item: SavedQuestion, port = storage()): SavedQuestion[] {
  const prior = readSavedQuestions(port);
  const existing = prior.find(row => row.id === item.id);
  const items = [{ ...existing, ...item, parentId: item.parentId ?? existing?.parentId }, ...prior.filter(row => row.id !== item.id)]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  try { port?.setItem(SAVED_QUESTIONS, JSON.stringify(items)); } catch { /* Keep this session usable. */ }
  return items;
}

function contextRecord(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
export function parentQuestionId(evidence: unknown): string | undefined {
  if (!Array.isArray(evidence)) return undefined;
  for (const value of [...evidence].reverse()) {
    const id = contextRecord(value)?.["parent_request_id"];
    if (typeof id === "string" && uuid.test(id)) return id;
  }
  return undefined;
}
/** Generated ancestry is carried by the server, rather than duplicated in the editable sources. */
export function editableEvidence(evidence: unknown): string[] {
  if (!Array.isArray(evidence)) return [];
  return evidence.filter((value): value is string => typeof value === "string" &&
    !contextRecord(value)?.["parent_request_id"] &&
    !["ASCENSION_REVISION", "ASCENSION_BLEND", "USER_SPIRAL_SELECTION", "LIBRARY_CARD"]
      .includes(String(contextRecord(value)?.["source"] ?? "")));
}

export function pathwayBlendInput(requestId: string, objective: string, pathway: ObjectivePathway): BlendInput {
  return { key: `${requestId}:${pathway.id}:pathway`, requestId, objective,
    pathwayId: pathway.id, pathwayLabel: pathway.label, kind: "pathway", name: pathway.label,
    description: [pathway.summary, ...pathway.steps, ...pathway.tradeoffs].join("\n").slice(0, 6000) };
}
export type PathwayVariable = { field: "summary" | "step" | "tradeoff"; index: number; name: string; description: string };
/** Select the actual delivered detail, without requiring a generated mesh or inferred part labels. */
export function pathwayVariables(pathway: ObjectivePathway): PathwayVariable[] {
  return [
    { field: "summary" as const, index: 0, name: "Design approach", description: pathway.summary },
    ...pathway.steps.map((description, index) => ({ field: "step" as const, index, name: `Step ${index + 1}`, description })),
    ...pathway.tradeoffs.map((description, index) => ({ field: "tradeoff" as const, index, name: `Tradeoff ${index + 1}`, description })),
  ].filter(variable => variable.description.trim());
}
export function variableBlendInput(requestId: string, objective: string, pathway: ObjectivePathway, variable: PathwayVariable): BlendInput {
  return { key: `${requestId}:${pathway.id}:variable:${variable.field}:${variable.index}`,
    requestId, objective, pathwayId: pathway.id, pathwayLabel: pathway.label, kind: "variable",
    name: `${pathway.label} · ${variable.name}`, description: variable.description };
}
export function partBlendInput(
  requestId: string, objective: string, pathway: ObjectivePathway, part: DesignPart,
  field?: "purpose" | "location" | "operation" | "connections" | "limitations",
): BlendInput {
  const labels = { purpose: "Purpose", location: "Location", operation: "How it works", connections: "Connections", limitations: "Design limits" };
  return { key: `${requestId}:${pathway.id}:part:${part.name}:${field ?? "all"}`,
    requestId, objective, pathwayId: pathway.id, pathwayLabel: pathway.label,
    kind: field ? "variable" : "part", name: field ? `${part.name} · ${labels[field]}` : part.name,
    description: field ? part[field] : [part.purpose, part.location, part.operation, part.connections, part.limitations].join("\n").slice(0, 6000) };
}
export function toggleBlendInput(items: BlendInput[], item: BlendInput): BlendInput[] {
  return items.some(value => value.key === item.key)
    ? items.filter(value => value.key !== item.key) : [...items, item];
}
export function readBlendSelection(port = storage()): BlendInput[] {
  try {
    const raw: unknown = JSON.parse(port?.getItem(BLEND_SELECTION) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is BlendInput => item && typeof item === "object" &&
      ["key", "requestId", "objective", "pathwayId", "pathwayLabel", "name", "description"]
        .every(field => typeof item[field] === "string") && uuid.test(item.requestId) &&
      ["pathway", "part", "variable"].includes(item.kind)).slice(0, 32);
  } catch { return []; }
}
export function saveBlendSelection(items: BlendInput[], port = storage()) {
  try { port?.setItem(BLEND_SELECTION, JSON.stringify(items)); } catch { /* Selection still works in this session. */ }
}
/** Context retains the actual earlier answer, excluding generated images and model assets. */
export function priorResultContext(parent: { id: string; objective: string }, result: unknown, action: string): string {
  const value = contextRecord(result);
  const choices = (raw: unknown) => Array.isArray(raw) ? raw.slice(0, 8).map(item => {
    const p = contextRecord(item) ?? {};
    const list = (value: unknown) => Array.isArray(value)
      ? value.filter((text): text is string => typeof text === "string").slice(0, 8).map(text => text.slice(0, 500)) : [];
    return { id: p["id"], label: String(p["label"] ?? "").slice(0, 300), summary: String(p["summary"] ?? "").slice(0, 1600),
      steps: list(p["steps"]), tradeoffs: list(p["tradeoffs"]), blend_reason: String(p["blend_reason"] ?? "").slice(0, 1500) };
  }) : [];
  return JSON.stringify({ source: "ASCENSION_PARENT_CONTEXT", parent_request_id: parent.id,
    requested_action: action, prior_objective: parent.objective,
    prior_result: value ? { title: value["title"], body: String(value["body"] ?? "").slice(0, 18000),
      pathways: choices(value["pathways"]), blend: choices(value["blend"] ? [value["blend"]] : [])[0] ?? null } : null,
    verification: "Earlier generated result supplied as context, not verified evidence." });
}

/** Each client evidence item must survive the intake's 2,000-character limit without broken JSON. */
export function revisionEvidence(kind: "new_answers" | "blend", inputs: BlendInput[] = [], changes = ""): string[] {
  if (kind === "blend" && inputs.length < 2) throw new Error("Choose at least two inputs to blend.");
  if (inputs.length > 24) throw new Error("Choose up to 24 inputs for one blend.");
  const header = JSON.stringify({ source: kind === "blend" ? "ASCENSION_BLEND" : "ASCENSION_REVISION",
    action: kind, selection_authority: kind === "blend" ? "USER_SELECTED" : "NEW_ALTERNATIVES",
    instruction: kind === "blend"
      ? "Create a NEW combined design from exactly the selected inputs. Explain what combines, what changes, and any conflicts. Do not substitute the old automatic blend or include unselected alternatives. Preserve the current objective and the supplied changes."
      : "Produce materially different answers and pathways to the same objective. Use the previous result for comparison, not as a response to repeat. Keep the user's sources and requirements.",
    changes: kind === "blend" ? changes.trim().slice(0, 900) : "", input_count: inputs.length });
  const records = inputs.flatMap((input, index) => {
    const meta = { source: "ASCENSION_BLEND", input: index + 1,
      request_id: input.requestId, pathway_id: input.pathwayId.slice(0, 150),
      original_objective: input.objective.slice(0, 300),
      pathway: input.pathwayLabel.slice(0, 200), kind: input.kind, name: input.name.slice(0, 200),
    };
    const width = Math.max(50, Math.floor((1900 - JSON.stringify(meta).length - 90) / 2));
    const chunks = input.description.match(new RegExp(`[\\s\\S]{1,${width}}`, "g")) ?? [""];
    return chunks.map((text, chunk) => JSON.stringify({ ...meta,
      detail_part: chunk + 1, detail_count: chunks.length, description: text }));
  });
  if ([header, ...records].some(item => item.length > 2000))
    throw new Error("A selected input is too large to include. Shorten its name or requested changes.");
  if (records.length > 29) throw new Error("This blend has too much detail. Choose fewer inputs.");
  return [header, ...records];
}

/** Exact repeats cannot qualify as new answers even if a model review accepts them. */
export function repeatedRevisionTargets(evidence: unknown, delivery: {
  body: string; pathways: { summary: string; steps: string[] }[];
  blend: { summary: string; steps: string[] } | null;
}): string[] {
  if (!Array.isArray(evidence)) return [];
  const records = evidence.map(contextRecord).filter((value): value is Record<string, unknown> => Boolean(value));
  if (!records.some(value => value["source"] === "ASCENSION_REVISION" && value["action"] === "new_answers")) return [];
  const parent = [...records].reverse().find(value => value["source"] === "ASCENSION_PARENT_CONTEXT");
  const prior = contextRecord(parent?.["prior_result"]);
  if (!prior) return [];
  const normalize = (value: unknown) => typeof value === "string" ? value.toLowerCase().replace(/\s+/g, " ").trim() : "";
  const signature = (value: unknown) => {
    const path = contextRecord(value);
    if (!path) return "";
    const summary = normalize(path["summary"]);
    const steps = Array.isArray(path["steps"]) ? path["steps"].map(normalize).filter(Boolean) : [];
    return summary || steps.length ? JSON.stringify([summary, steps]) : "";
  };
  const previous = Array.isArray(prior["pathways"]) ? prior["pathways"] : [];
  const signatures = new Set([...previous, prior["blend"]].map(signature).filter(Boolean));
  const repeats = delivery.pathways.flatMap((path, index) => signatures.has(signature(path)) ? [`pathway_${index + 1}`] : []);
  if (delivery.blend && signatures.has(signature(delivery.blend))) repeats.push("blend");
  if (!delivery.pathways.length && !delivery.blend && normalize(delivery.body) && normalize(delivery.body) === normalize(prior["body"]))
    repeats.push("result");
  return repeats;
}

