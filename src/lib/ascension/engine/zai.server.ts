/**
 * Server-only Z.AI client.
 *
 * Z.AI is an EXTERNAL execution engine. Nothing here is ASCENSION governed
 * state: every response returned by this module is raw external output and must
 * be labelled as such by the caller. This module never writes governed state,
 * never invents a value and never rewrites an engine error.
 */
import { formatKnowledgeEvidence, retrieveKnowledge } from "./knowledge.server";

const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";
const DEFAULT_MODEL = "glm-4.6";
const LOVABLE_BASE_URL = "https://ai.gateway.lovable.dev/v1";
const LOVABLE_MODEL = "google/gemini-3.1-flash-lite";
// Local answer engine remains available for local development only when an
// explicit LOCAL_LLM_BASE_URL is configured. Production ENGAGE uses Lovable AI.
const DEFAULT_LOCAL_MODEL = "qwen3:4b";
const LOCAL_MAX_TOKENS = 4096;

function localLlmConfig() {
  const baseUrl = process.env["LOCAL_LLM_BASE_URL"]?.trim();
  return baseUrl
    ? {
        baseUrl: baseUrl.replace(/\/+$/, ""),
        model: process.env["LOCAL_LLM_MODEL"]?.trim() || DEFAULT_LOCAL_MODEL,
      }
    : null;
}

/** Strip a local model's inline reasoning block if it leaks into content. */
function stripInlineReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export interface ZaiCallResult {
  model: string;
  text: string;
  json: Record<string, unknown> | null;
  duration_ms: number;
}

export class ZaiEngineError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ZaiEngineError";
    this.status = status;
  }
}

export function zaiModel(): string {
  if (process.env["LOVABLE_API_KEY"]?.trim()) {
    return process.env["LOVABLE_AI_MODEL"]?.trim() || LOVABLE_MODEL;
  }
  const hosted = process.env["ZAI_MODEL"]?.trim();
  if (hosted && process.env["ZAI_API_KEY"]?.trim()) return hosted;
  if (process.env["ZAI_API_KEY"]?.trim()) return DEFAULT_MODEL;
  return localLlmConfig()?.model || LOVABLE_MODEL;
}

function zaiBaseUrl(): string {
  return (process.env["ZAI_BASE_URL"]?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Raw external text is still returned verbatim.
    }
  }
  return null;
}

async function readStream(response: Response): Promise<string> {
  const body = response.body;
  if (!body) throw new ZaiEngineError("Z.AI returned no response body", response.status);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  function consume(raw: string) {
    const line = raw.trim();
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    if (parsed.error)
      throw new ZaiEngineError(
        String(parsed.error.message ?? "Z.AI stream failed"),
        response.status,
      );
    for (const choice of parsed.choices ?? []) {
      const fragment = choice.delta?.content ?? choice.message?.content;
      if (typeof fragment === "string") text += fragment;
    }
  }

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) consume(raw);
    }
    consume(buffer + decoder.decode());
  } finally {
    reader.releaseLock();
  }
  return text;
}

/** One streamed engine call. Production prefers Lovable's built-in AI gateway;
 *  Z.AI is used only when explicitly configured, and a local OpenAI-compatible
 *  engine is used only when LOCAL_LLM_BASE_URL is explicitly set. */
export async function callZai(input: {
  system: string;
  user: string;
  /** Short search phrase (normally the objective). Never the full stage prompt. */
  knowledgeQuery?: string;
  temperature?: number;
}): Promise<ZaiCallResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"]?.trim();
  const zaiKey = process.env["ZAI_API_KEY"]?.trim();
  const local = !lovableKey && !zaiKey ? localLlmConfig() : null;
  const provider = lovableKey ? "lovable" : zaiKey ? "zai" : local ? "local" : null;
  if (!provider) {
    throw new ZaiEngineError(
      "No answer engine is configured. Lovable AI should provide LOVABLE_API_KEY in deployed projects.",
    );
  }

  let knowledgeText = "ASCENSION internal knowledge retrieval unavailable for this call.";
  try {
    const query = (input.knowledgeQuery ?? input.user).replace(/\s+/g, " ").trim().slice(0, 300);
    const knowledge = await retrieveKnowledge(query, 6);
    knowledgeText = formatKnowledgeEvidence(knowledge);
  } catch (cause) {
    knowledgeText = `ASCENSION internal knowledge retrieval failed: ${cause instanceof Error ? cause.message : String(cause)}`;
  }

  const system = [
    input.system,
    "The ASCENSION INTERNAL KNOWLEDGE section comes from ASCENSION's own published Knowledgeverse, pathways, governance, ledger and chamber state.",
    "Use that internal knowledge as the primary context. Do not invent missing internal state and do not imply external web research occurred.",
    "When directly relevant prior ASCENSION knowledge is present, explicitly connect the current objective to that prior knowledge and cite its [A#] marker in the response. Distinguish stored Meaning Elements, prior transitions/evidence, and verified Delta from general model knowledge.",
    "CITATION RULE: an [A#] marker supports only the exact stored record printed under that marker. Do not say ASCENSION internal knowledge confirms, proves, verifies, establishes, demonstrates, or supports a scientific or technical claim unless the exact stored Knowledge text states that claim.",
    "A prior Meaning Element such as 'magnets and coils' supports only the statement that ASCENSION has prior internal history involving magnets and coils. It does not by itself verify Faraday's law, relative motion, voltage, copper-wire behavior, efficiency, or any other physics claim.",
    "Runtime provenance such as a verified transition, evidence record, or verified Delta means ASCENSION verified that runtime record/transition. It does not automatically make every scientific proposition associated with the objective externally verified.",
    "For information supplied by the model's general training knowledge rather than the internal records, explicitly introduce it as general knowledge (for example: 'From general physics knowledge...'). Never blend it into an ASCENSION-internal citation.",
    "If the internal records do not contain enough information to answer completely, state the internal connection first, then clearly separate the general-knowledge explanation.",
    "A retrieved internal record is not automatically new VERIFIED Delta merely because it was read; preserve its published provenance and status.",
  ].join(" ");
  // Local engines run smaller context windows; keep retrieved evidence compact.
  const knowledgeForPrompt = provider === "local" ? knowledgeText.slice(0, 2400) : knowledgeText;
  const user = `${input.user}\n\nASCENSION INTERNAL KNOWLEDGE:\n${knowledgeForPrompt}`;

  const model = zaiModel();
  const started = Date.now();
  const baseUrl =
    provider === "lovable" ? LOVABLE_BASE_URL : provider === "zai" ? zaiBaseUrl() : local!.baseUrl;
  const apiKey = provider === "lovable" ? lovableKey : provider === "zai" ? zaiKey : null;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(provider === "local" ? 180000 : 90000),
      headers:
        provider === "local"
          ? {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            }
          : {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              ...(provider === "lovable" ? { "Lovable-API-Key": apiKey! } : {}),
              Accept: "text/event-stream",
            },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: input.temperature ?? 0.2,
        // Local reasoning models budget their thinking inside max_tokens;
        // without headroom the visible answer can come back empty.
        ...(provider === "local" ? { max_tokens: LOCAL_MAX_TOKENS } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    if (provider === "local") {
      throw new ZaiEngineError(
        `The local answer engine at ${local!.baseUrl} is unreachable (${detail}).`,
      );
    }
    throw new ZaiEngineError(
      `${provider === "lovable" ? "Lovable AI" : "Z.AI"} request failed: ${detail}`,
    );
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 2000);
    throw new ZaiEngineError(
      `${provider === "local" ? `The local answer engine (${local!.baseUrl})` : provider === "lovable" ? "Lovable AI" : "Z.AI"} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  const text = stripInlineReasoning(await readStream(response));
  if (!text.trim()) {
    throw new ZaiEngineError(
      `${provider === "local" ? "The local answer engine" : provider === "lovable" ? "Lovable AI" : "Z.AI"} returned an empty response`,
      response.status,
    );
  }

  return { model, text, json: extractJson(text), duration_ms: Date.now() - started };
}
