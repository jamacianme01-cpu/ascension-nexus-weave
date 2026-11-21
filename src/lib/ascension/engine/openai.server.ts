/**
 * DISABLED FOR ASCENSION V1 ARCHITECTURE RECOVERY (2026-11-19).
 *
 * External AI providers are not part of the ASCENSION engine architecture.
 * callOpenAIResponse must not be used for pathway generation, design results,
 * or as a substitute for governed ASCENSION engines.
 * This module is retained only so historical imports do not break typecheck;
 * delivery and approved-answer paths no longer invoke it.
 *
 * --- original header below ---
 */
export interface OpenAIWebSource {
  title: string;
  url: string;
}

export interface OpenAIAnswer {
  model: string;
  text: string;
  sources: OpenAIWebSource[];
}

export class OpenAIProviderError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "OpenAIProviderError";
    this.status = status;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sourceFrom(raw: unknown): OpenAIWebSource | null {
  const value = record(raw);
  const url = value["url"];
  if (typeof url !== "string" || url.length > 2000) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const title = typeof value["title"] === "string" && value["title"].trim()
      ? value["title"].trim().slice(0, 160)
      : parsed.hostname;
    return { title, url: parsed.href };
  } catch {
    return null;
  }
}

/** Extract URLs from tool-reported sources and actual URL citation annotations. */
export function extractOpenAIWebSources(payload: unknown): OpenAIWebSource[] {
  const outputs = record(payload)["output"];
  if (!Array.isArray(outputs)) return [];
  const citations: OpenAIWebSource[] = [];
  const consulted: OpenAIWebSource[] = [];
  const add = (list: OpenAIWebSource[], raw: unknown) => {
    const value = sourceFrom(raw);
    if (value && !list.some((item) => item.url === value.url)) list.push(value);
  };
  for (const raw of outputs) {
    const item = record(raw);
    if (item["type"] === "web_search_call") {
      const sources = record(item["action"])["sources"];
      if (Array.isArray(sources)) for (const source of sources) add(consulted, source);
    }
    if (item["type"] !== "message") continue;
    const contents = item["content"];
    if (!Array.isArray(contents)) continue;
    for (const rawContent of contents) {
      const annotations = record(rawContent)["annotations"];
      if (Array.isArray(annotations)) {
        for (const ann of annotations) {
          const a = record(ann);
          if (a["type"] === "url_citation") add(citations, a);
        }
      }
    }
  }
  return citations.length ? citations : consulted;
}

function responseText(payload: unknown): string {
  const out = record(payload)["output_text"];
  if (typeof out === "string" && out.trim()) return out.trim();
  const outputs = record(payload)["output"];
  if (!Array.isArray(outputs)) return "";
  const parts: string[] = [];
  for (const raw of outputs) {
    const item = record(raw);
    if (item["type"] !== "message") continue;
    const contents = item["content"];
    if (!Array.isArray(contents)) continue;
    for (const rawContent of contents) {
      const c = record(rawContent);
      if (c["type"] === "output_text" && typeof c["text"] === "string") parts.push(c["text"]);
    }
  }
  return parts.join("\n").trim();
}

/**
 * Optional server-only OpenAI Responses provider.
 * DISABLED for ASCENSION architecture — retained for type compatibility only.
 */
export async function callOpenAIResponse(input: {
  system: string;
  user: string;
  webSearch?: boolean;
  imageDataUrl?: string;
  timeoutMs?: number;
  structuredOutput?: { name: string; schema: Record<string, unknown> };
}): Promise<OpenAIAnswer> {
  throw new OpenAIProviderError(
    "OpenAI is disabled for ASCENSION architecture recovery. Use the existing ASCENSION governed runtime.",
  );
}
