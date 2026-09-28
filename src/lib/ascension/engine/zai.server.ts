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
// Local answer engine (OpenAI-compatible, e.g. Ollama at localhost:11434).
// Used only when no hosted ZAI_API_KEY is configured, so ENGAGE can still
// return real text without any credential leaving the machine.
const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_LOCAL_MODEL = "qwen3:4b";
const LOCAL_MAX_TOKENS = 4096;

function localLlmConfig() {
  return {
    baseUrl: (process.env["LOCAL_LLM_BASE_URL"]?.trim() || DEFAULT_LOCAL_BASE_URL).replace(
      /\/+$/,
      "",
    ),
    model: process.env["LOCAL_LLM_MODEL"]?.trim() || DEFAULT_LOCAL_MODEL,
  };
}

/** True when no hosted key exists and the local engine is not explicitly disabled. */
function usingLocalEngine(): boolean {
  return !process.env["ZAI_API_KEY"]?.trim() && process.env["LOCAL_LLM_BASE_URL"]?.trim() !== "";
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
  const hosted = process.env["ZAI_MODEL"]?.trim();
  if (hosted) return hosted;
  if (process.env["ZAI_API_KEY"]?.trim()) return DEFAULT_MODEL;
  return localLlmConfig().model;
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

/** One streamed engine call — hosted Z.AI when a key exists, otherwise the
 *  local OpenAI-compatible engine — with live external knowledge as evidence. */
export async function callZai(input: {
  system: string;
  user: string;
  /** Short search phrase (normally the objective). Never the full stage prompt. */
  knowledgeQuery?: string;
  temperature?: number;
}): Promise<ZaiCallResult> {
  const apiKey = process.env["ZAI_API_KEY"]?.trim();
  const local = !apiKey ? localLlmConfig() : null;
  if (!apiKey && !local) {
    throw new ZaiEngineError(
      "ZAI_API_KEY is not configured; the hosted Z.AI engine is unavailable.",
    );
  }

  let knowledgeText = "External knowledge retrieval unavailable for this call.";
  try {
    const query = (input.knowledgeQuery ?? input.user).replace(/\s+/g, " ").trim().slice(0, 300);
    const knowledge = await retrieveKnowledge(query, 6);
    knowledgeText = formatKnowledgeEvidence(knowledge);
  } catch (cause) {
    knowledgeText = `External knowledge retrieval failed: ${cause instanceof Error ? cause.message : String(cause)}`;
  }

  const system = [
    input.system,
    "The EXTERNAL KNOWLEDGE section contains retrieved public information. Treat it only as external evidence.",
    "Do not claim retrieved information is ASCENSION VERIFIED or PERSISTED. Preserve source URLs when relying on it.",
  ].join(" ");
  // Local engines run smaller context windows; keep retrieved evidence compact.
  const knowledgeForPrompt = local ? knowledgeText.slice(0, 2400) : knowledgeText;
  const user = `${input.user}\n\nEXTERNAL KNOWLEDGE (retrieved evidence; not governed state):\n${knowledgeForPrompt}`;

  const model = zaiModel();
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(`${local ? local.baseUrl : zaiBaseUrl()}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(local ? 180000 : 90000),
      headers: local
        ? {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          }
        : {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            Accept: "text/event-stream",
          },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: input.temperature ?? 0.2,
        // Local reasoning models budget their thinking inside max_tokens;
        // without headroom the visible answer can come back empty.
        ...(local ? { max_tokens: LOCAL_MAX_TOKENS } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    if (local) {
      throw new ZaiEngineError(
        `The local answer engine at ${local.baseUrl} is unreachable (${detail}). Set ZAI_API_KEY to use the hosted Z.AI engine, or start the local engine.`,
      );
    }
    throw new ZaiEngineError(`Z.AI request failed: ${detail}`);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 2000);
    throw new ZaiEngineError(
      `${local ? `The local answer engine (${local.baseUrl})` : "Z.AI"} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  const text = stripInlineReasoning(await readStream(response));
  if (!text.trim()) {
    throw new ZaiEngineError(
      `${local ? "The local answer engine" : "Z.AI"} returned an empty response`,
      response.status,
    );
  }

  return { model, text, json: extractJson(text), duration_ms: Date.now() - started };
}
