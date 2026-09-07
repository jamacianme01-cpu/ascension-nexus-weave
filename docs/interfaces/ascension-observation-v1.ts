/** No Python dependencies. GET-only consumer for ASCENSION observation v1. */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Availability = "available" | "last_verified" | "unavailable";

export interface KnowledgeForm {
  entity_id: string;
  persistent_entity_id: string;
  sid: string;
  destiny_id: Json;
  objective_id: Json;
  chromosome: { [key: string]: Json };
  developmental_state: "RESTING" | "RECEIVING" | "RELATING" | "SYNTHESIZING" | "EVOLVING" | "COMPLETING";
  phenotype: { [key: string]: Json };
  active_meaning_elements: Json;
  key_relationships: Json;
  lineage: { [key: string]: Json };
  verified_delta: { [key: string]: Json };
  emergence_detected: boolean | null;
  dtf_transverse_available: boolean | null;
  manifestation_readiness: Json;
  environment_context: Json;
  library_card_reference: Json;
}

export interface SnapshotContent {
  schema_version: "ascension.observation.v1";
  snapshot_revision: number;
  source_revisions: {
    [surface: string]: { revision: number; state_hash: string; published_at: string; knowledgeverse_id: string };
  };
  knowledgeverse_id: string;
  knowledge_forms: KnowledgeForm[];
  chamber: null;
  pathways: Json;
  outcome_predictor: Json;
  dynamic_balance: Json;
  wisdom_recommendation: Json;
  guardian_verdict: Json;
  autosync_verification: Json;
  ledger: Json;
  galaxy_bridges: Json;
  governed_state?: { [key: string]: Json };
  publication_provenance?: { [key: string]: Json };
  unavailable_reason: "not_in_linked_publication_contract";
}

export interface Snapshot {
  schema_version: "ascension.observation.v1";
  generated_at: string;
  availability: Availability;
  error: string | null;
  content: SnapshotContent | null;
  snapshot_hash: string | null;
}

export interface SurfaceResponse<T = Json> {
  schema_version: "ascension.observation.v1";
  generated_at: string;
  availability: Availability;
  error: string | null;
  snapshot_revision: number | null;
  snapshot_hash: string | null;
  data: T | null;
}

export interface LedgerResponse {
  schema_version: "ascension.observation.v1";
  ledger_valid: boolean | null;
  entry_count: number | null;
  latest_record_hash: string | null;
  broken_index: number | null;
  error: string | null;
  source_hash?: string;
  coherent_with_snapshot?: false;
}

export interface ChamberResponse {
  schema_version: "ascension.observation.v1";
  generated_at: string;
  availability: "available" | "unavailable";
  error: string | null;
  source_revision: null;
  source_hash: string | null;
  source_integrity: "unversioned_unverified";
  source_classification: "LIVE_CONTROLLER" | "UNAVAILABLE";
  coherent_with_snapshot: false;
  data: { [key: string]: Json } | null;
}

export const endpoints = ["status", "chamber", "knowledgeverse", "pathways", "governance", "ledger", "outcomes", "galaxy-bridges", "manifestation", "snapshot"] as const;

function object(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).sort().join("|") !== keys.sort().join("|")) throw new Error("Unexpected schema keys");
}

export function parseSnapshot(input: unknown): Snapshot {
  object(input);
  exactKeys(input, ["schema_version", "generated_at", "availability", "error", "content", "snapshot_hash"]);
  if (input.schema_version !== "ascension.observation.v1" || typeof input.generated_at !== "string" || !Number.isFinite(Date.parse(input.generated_at))) throw new Error("Invalid envelope");
  if (!["available", "last_verified", "unavailable"].includes(String(input.availability))) throw new Error("Invalid availability");
  if (input.error !== null && typeof input.error !== "string") throw new Error("Invalid error");
  if (input.content === null) {
    if (input.availability !== "unavailable" || input.snapshot_hash !== null || typeof input.error !== "string") throw new Error("Invalid unavailable state");
    return input as unknown as Snapshot;
  }
  if (input.availability === "unavailable" || (input.availability === "available" && input.error !== null) || (input.availability === "last_verified" && typeof input.error !== "string")) throw new Error("Inconsistent status");
  const c = input.content;
  object(c);
  const absent = ["chamber", "pathways", "outcome_predictor", "dynamic_balance", "wisdom_recommendation", "guardian_verdict", "autosync_verification", "ledger", "galaxy_bridges"];
  const governed = "governed_state" in c;
  exactKeys(c, ["schema_version", "snapshot_revision", "source_revisions", "knowledgeverse_id", "knowledge_forms", "unavailable_reason", ...absent, ...(governed ? ["governed_state", "publication_provenance"] : [])]);
  if (c.schema_version !== input.schema_version || !Number.isSafeInteger(c.snapshot_revision) || Number(c.snapshot_revision) < 1 || typeof c.knowledgeverse_id !== "string" || c.unavailable_reason !== "not_in_linked_publication_contract") throw new Error("Invalid content");
  if (!governed && absent.some(k => c[k] !== null)) throw new Error("Unpublished field");
  if (c.chamber !== null) throw new Error("Controller merged into governed snapshot");
  object(c.source_revisions);
  exactKeys(c.source_revisions, [governed ? "governed" : "manifestation"]);
  const s = c.source_revisions[governed ? "governed" : "manifestation"];
  object(s);
  exactKeys(s, ["revision", "state_hash", "published_at", "knowledgeverse_id"]);
  if (s.revision !== c.snapshot_revision || s.knowledgeverse_id !== c.knowledgeverse_id || typeof s.state_hash !== "string" || !(governed ? /^sha256:[a-f0-9]{64}$/ : /^sha1:[a-f0-9]{40}$/).test(s.state_hash) || typeof s.published_at !== "string" || !Number.isFinite(Date.parse(s.published_at))) throw new Error("Invalid source revision");
  if (governed) {
    const g = c.governed_state, p = c.publication_provenance;
    object(g); object(p);
    if (p.schema_version !== "ascension.governed_publication.v1" || p.source_classification !== "LIVE_GOVERNED" || p.publisher !== "ASCENSION_CORE.GovernedClosure" || p.verification_status !== "VERIFIED" || p.content_hash !== s.state_hash || p.publication_revision !== c.snapshot_revision || g.knowledgeverse_id !== c.knowledgeverse_id) throw new Error("Invalid governed provenance");
    object(g.runtime); object(g.verified_delta); object(g.autosync); object(g.guardian); object(g.knowledge_forms);
    if (g.runtime.status !== "COMPLETED_VERIFIED" || g.verified_delta.status !== "COMMITTED" || g.verified_delta.transaction !== "PERSISTED" || g.autosync.verdict !== "VERIFIED" || g.verified_delta.delta_id !== p.latest_verified_delta_ref || g.commit_reference !== p.source_transaction_id) throw new Error("Uncommitted state");
    if (!Array.isArray(g.lineage) || !g.lineage.length || !Array.isArray(g.guardian.steps) || !g.guardian.steps.length) throw new Error("Missing governed evidence");
    for (const step of g.guardian.steps) { object(step); if (step.result !== "PASS") throw new Error("Guardian failed"); }
    for (const [id, form] of Object.entries(g.knowledge_forms)) { object(form); if (form.form_id !== id || typeof form.current_sid !== "string" || typeof form.persistent_id !== "string") throw new Error("Invalid governed identity"); }
  }
  if (!Array.isArray(c.knowledge_forms)) throw new Error("Invalid forms");
  const seen = new Set<string>();
  for (const f of c.knowledge_forms) {
    object(f);
    exactKeys(f, ["entity_id", "persistent_entity_id", "sid", "destiny_id", "objective_id", "chromosome", "developmental_state", "phenotype", "active_meaning_elements", "key_relationships", "lineage", "verified_delta", "emergence_detected", "dtf_transverse_available", "manifestation_readiness", "environment_context", "library_card_reference"]);
    for (const k of ["entity_id", "persistent_entity_id", "sid"]) if (typeof f[k] !== "string" || !f[k]) throw new Error("Invalid identity");
    if (seen.has(String(f.entity_id))) throw new Error("Duplicate identity");
    seen.add(String(f.entity_id));
    if (!["RESTING", "RECEIVING", "RELATING", "SYNTHESIZING", "EVOLVING", "COMPLETING"].includes(String(f.developmental_state))) throw new Error("Invalid lifecycle");
    for (const k of ["chromosome", "phenotype", "lineage", "verified_delta"]) object(f[k]);
    for (const k of ["emergence_detected", "dtf_transverse_available"]) if (f[k] !== null && typeof f[k] !== "boolean") throw new Error("Invalid availability flag");
  }
  if (typeof input.snapshot_hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(input.snapshot_hash)) throw new Error("Invalid snapshot hash");
  return input as unknown as Snapshot;
}

/** Verify against the Python canonical serialization. Pass the original response text:
 * re-stringifying IEEE-754 numbers in JS can change Python's lexical representation.
 * The server serializes the whole response canonically with content as one object.
 */
export async function verifySnapshotText(text: string): Promise<Snapshot> {
  const parsed = parseSnapshot(JSON.parse(text));
  if (parsed.content === null) return parsed;
  const marker = '"content":';
  const start = text.indexOf(marker) + marker.length;
  if (start < marker.length || text[start] !== "{") throw new Error("Noncanonical response");
  let depth = 0, quoted = false, escaped = false, end = start;
  for (; end < text.length; end++) {
    const ch = text[end];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) { end++; break; }
  }
  const bytes = new TextEncoder().encode(text.slice(start, end));
  if (JSON.stringify(JSON.parse(text.slice(start, end))) !== JSON.stringify(parsed.content)) throw new Error("Ambiguous content");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
  if (parsed.snapshot_hash !== `sha256:${hex}`) throw new Error("Snapshot hash mismatch");
  if (parsed.content.governed_state) {
    const raw = extractObject(text, "governed_state");
    if (JSON.stringify(JSON.parse(raw)) !== JSON.stringify(parsed.content.governed_state)) throw new Error("Ambiguous governed state");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    const stateHex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    if (`sha256:${stateHex}` !== parsed.content.source_revisions.governed.state_hash) throw new Error("Governed content hash mismatch");
  }
  return parsed;
}

function extractObject(text: string, key: string): string {
  const marker = JSON.stringify(key) + ":";
  const start = text.indexOf(marker) + marker.length;
  if (start < marker.length || text[start] !== "{") throw new Error("Missing canonical object");
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') quoted = false; }
    else if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error("Incomplete canonical object");
}

export async function fetchSnapshot(baseUrl: string): Promise<Snapshot> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ascension/v1/snapshot`, { method: "GET", credentials: "omit" });
  if (!response.ok && response.status !== 503) throw new Error(`Observation HTTP ${response.status}`);
  return verifySnapshotText(await response.text());
}

export async function fetchChamber(baseUrl: string): Promise<ChamberResponse> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ascension/v1/chamber`, {method: "GET", credentials: "omit"});
  if (!response.ok && response.status !== 503) throw new Error(`Observation HTTP ${response.status}`);
  const value: unknown = await response.json();
  object(value);
  exactKeys(value, ["schema_version", "generated_at", "availability", "error", "source_revision", "source_hash", "source_integrity", "source_classification", "coherent_with_snapshot", "data"]);
  if (value.schema_version !== "ascension.observation.v1" || value.source_revision !== null || value.source_integrity !== "unversioned_unverified" || value.coherent_with_snapshot !== false) throw new Error("Invalid chamber contract");
  if (value.availability === "available") {
    object(value.data);
    if (value.source_classification !== "LIVE_CONTROLLER" || value.data.bridge_contract !== "ascension.unreal_bridge.v2" || typeof value.source_hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.source_hash)) throw new Error("Invalid chamber source");
  } else if (value.availability !== "unavailable" || value.data !== null) throw new Error("Invalid chamber status");
  return value as unknown as ChamberResponse;
}
