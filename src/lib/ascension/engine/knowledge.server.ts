/**
 * Server-only external knowledge retrieval for ASCENSION objectives.
 *
 * Retrieved material is EXTERNAL EVIDENCE. It is never VERIFIED, accepted Δ,
 * or PERSISTED merely because retrieval succeeded. The governed runtime remains
 * authoritative for those transitions.
 */

export interface KnowledgeEvidence {
  title: string;
  url: string;
  snippet: string;
  source: "web";
}

export interface KnowledgeRetrievalResult {
  query: string;
  evidence: KnowledgeEvidence[];
  retrieved_at: string;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDuckRedirect(value: string): string {
  try {
    const parsed = new URL(value, "https://html.duckduckgo.com");
    const target = parsed.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : parsed.href;
  } catch {
    return value;
  }
}

export async function retrieveKnowledge(
  query: string,
  limit = 6,
): Promise<KnowledgeRetrievalResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { query: cleanQuery, evidence: [], retrieved_at: new Date().toISOString() };
  }

  const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: "text/html",
      "User-Agent": "ASCENSION-Knowledge-Retrieval/1.0",
    },
  });

  if (!response.ok) throw new Error(`Knowledge retrieval returned HTTP ${response.status}`);

  const html = await response.text();
  const blocks = html.split(/class=["']result(?:\s|__)/i).slice(1);
  const evidence: KnowledgeEvidence[] = [];

  for (const block of blocks) {
    if (evidence.length >= Math.max(1, Math.min(limit, 10))) break;
    const link = block.match(/class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const href = link?.[1];
    const titleHtml = link?.[2];
    if (!href || !titleHtml) continue;
    const snippet = block.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)/i);
    const url = decodeDuckRedirect(href);
    if (!/^https?:\/\//i.test(url)) continue;
    evidence.push({
      title: stripHtml(titleHtml),
      url,
      snippet: stripHtml(snippet?.[1] ?? ""),
      source: "web",
    });
  }

  return { query: cleanQuery, evidence, retrieved_at: new Date().toISOString() };
}

export function formatKnowledgeEvidence(result: KnowledgeRetrievalResult): string {
  if (result.evidence.length === 0) return "No external knowledge results were retrieved.";
  return result.evidence
    .map((item, index) =>
      `[K${index + 1}] ${item.title}\nURL: ${item.url}\nEvidence: ${item.snippet || "No snippet supplied by source."}`,
    )
    .join("\n\n");
}
