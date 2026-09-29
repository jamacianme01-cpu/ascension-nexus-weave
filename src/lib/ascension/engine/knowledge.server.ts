/**
 * Server-only ASCENSION internal knowledge retrieval.
 *
 * Knowledge comes from ASCENSION's own published governed state first:
 * Knowledgeverse, pathways, governance, ledger, chamber and Library Cards.
 * Nothing here performs an external web search.
 */
export interface KnowledgeEvidence {
  title: string;
  source_path: string;
  snippet: string;
  source: "ascension";
}

export interface KnowledgeRetrievalResult {
  query: string;
  evidence: KnowledgeEvidence[];
  retrieved_at: string;
  source_revision: number | null;
}

const INTERNAL_PATHS = [
  "/knowledgeverse",
  "/pathways",
  "/governance",
  "/ledger",
  "/chamber",
] as const;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function tokens(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((part) => part.length >= 3),
  )].slice(0, 32);
}

function flattenStrings(value: unknown, path = "$", out: { path: string; text: string }[] = []) {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) out.push({ path, text });
    return out;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push({ path, text: String(value) });
    return out;
  }
  if (Array.isArray(value)) {
    value.slice(0, 300).forEach((item, i) => flattenStrings(item, `${path}[${i}]`, out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      flattenStrings(item, `${path}.${key}`, out);
      if (out.length >= 3000) break;
    }
  }
  return out;
}

function score(queryTokens: string[], item: { path: string; text: string }) {
  const hay = `${item.path} ${item.text}`.toLowerCase();
  let value = 0;
  for (const token of queryTokens) {
    if (hay.includes(token)) value += item.path.toLowerCase().includes(token) ? 4 : 2;
  }
  if (/verified|knowledge|meaning|relationship|lineage|delta|pathway|guardian|confidence|world|destiny/i.test(item.path)) {
    value += 1;
  }
  return value;
}

function compactFallback(doc: Record<string, unknown>, sourcePath: string) {
  const data = record(doc["data"]);
  if (sourcePath === "/knowledgeverse") {
    const forms = Array.isArray(data["knowledge_forms"]) ? data["knowledge_forms"] : [];
    const summaries = forms.slice(0, 8).map((raw) => {
      const form = record(raw);
      const phenotype = record(form["phenotype"]);
      const delta = record(record(form["verified_delta"])["summary"]);
      return [
        String(form["entity_id"] ?? "form"),
        `SID=${String(form["sid"] ?? "unknown")}`,
        `state=${String(form["developmental_state"] ?? "unknown")}`,
        `capabilities=${Array.isArray(phenotype["active_capabilities"]) ? phenotype["active_capabilities"].join(",") : ""}`,
        `verified_delta=K:${String(delta["K"] ?? 0)},W:${String(delta["W"] ?? 0)},U:${String(delta["U"] ?? 0)}`,
      ].join(" | ");
    });
    return summaries.join("\n");
  }
  return JSON.stringify(data).slice(0, 3500);
}

export async function retrieveKnowledge(
  query: string,
  limit = 12,
): Promise<KnowledgeRetrievalResult> {
  const cleanQuery = query.trim();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("ascension_relay_documents")
    .select("path, body, http_status")
    .in("path", [...INTERNAL_PATHS])
    .eq("http_status", 200);
  if (error) throw new Error(`ASCENSION internal knowledge retrieval failed: ${error.message}`);

  const queryTokens = tokens(cleanQuery);
  const candidates: { sourcePath: string; path: string; text: string; score: number }[] = [];
  let sourceRevision: number | null = null;

  for (const row of data ?? []) {
    let doc: Record<string, unknown>;
    try {
      doc = record(JSON.parse(row.body));
    } catch {
      continue;
    }
    const revision = doc["snapshot_revision"];
    if (typeof revision === "number") sourceRevision = Math.max(sourceRevision ?? 0, revision);
    const root = doc["data"] ?? doc;
    const flattened = flattenStrings(root);
    for (const item of flattened) {
      const s = score(queryTokens, item);
      if (s > 0) candidates.push({ sourcePath: row.path, ...item, score: s });
    }

    // Always retain a compact Knowledgeverse baseline so ASCENSION never
    // answers from a model with zero internal context.
    if (row.path === "/knowledgeverse") {
      const baseline = compactFallback(doc, row.path);
      if (baseline) candidates.push({
        sourcePath: row.path,
        path: "$.knowledgeverse.baseline",
        text: baseline,
        score: 1,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const evidence: KnowledgeEvidence[] = [];
  for (const item of candidates) {
    const key = `${item.sourcePath}|${item.path}|${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push({
      title: item.path,
      source_path: item.sourcePath,
      snippet: item.text.slice(0, 1800),
      source: "ascension",
    });
    if (evidence.length >= Math.max(1, Math.min(limit, 24))) break;
  }

  return {
    query: cleanQuery,
    evidence,
    retrieved_at: new Date().toISOString(),
    source_revision: sourceRevision,
  };
}

export function formatKnowledgeEvidence(result: KnowledgeRetrievalResult): string {
  if (result.evidence.length === 0) {
    return "No matching internal ASCENSION knowledge was found in the current governed publication.";
  }
  const header = `ASCENSION INTERNAL KNOWLEDGE · snapshot revision ${result.source_revision ?? "unknown"}`;
  return [
    header,
    ...result.evidence.map(
      (item, index) =>
        `[A${index + 1}] ${item.source_path} · ${item.title}\nKnowledge: ${item.snippet}`,
    ),
  ].join("\n\n");
}
