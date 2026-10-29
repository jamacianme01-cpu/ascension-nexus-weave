/**
 * Server-only answer-engine client (Z.AI / OpenRouter / local / OpenAI).
 * No third-party editor platform gateways.
 */
import {
  formatKnowledgeEvidence,
  retrieveKnowledge,
  type KnowledgeRetrievalResult,
} from "./knowledge.server";
import { callOpenAIResponse } from "./openai.server";

const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";
const DEFAULT_MODEL = "glm-4.6";
const FREE_BASE_URL = "https://openrouter.ai/api/v1";
const FREE_MODEL = "openrouter/free";
const ZAI_FREE_TEXT_MODEL = "glm-4.7-flash";
const ZAI_FREE_VISION_MODEL = "glm-4.6v-flash";
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

function stripInlineReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
}

function ollamaChatUrl(baseUrl: string): string | null {
  const url = new URL(baseUrl);
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    url.port === "11434" && url.pathname === "/v1"
    ? `${url.origin}/api/chat`
    : null;
}

export interface ZaiCallResult {
  model: string;
  text: string;
  json: Record<string, unknown> | null;
  duration_ms: number;
  knowledge: KnowledgeRetrievalResult | null;
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
  if (process.env["ASCENSION_ALLOW_OPENAI_AI"] === "true" && process.env["OPENAI_API_KEY"]?.trim())
    return process.env["ASCENSION_OPENAI_MODEL"]?.trim() || "gpt-4.1-mini";
  if (process.env["OPENROUTER_API_KEY"]?.trim()) return FREE_MODEL;
  if (process.env["ZAI_API_KEY"]?.trim()) return ZAI_FREE_TEXT_MODEL;
  if (localLlmConfig()) return localLlmConfig()!.model;
  return DEFAULT_LOCAL_MODEL;
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
      /* raw text still returned */
    }
  }
  return null;
}

async function readStream(response: Response, nativeOllama = false) {
  const body = response.body;
  if (!body) throw new ZaiEngineError("Answer engine returned no response body", response.status);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finishReason: string | null = null;
  let sawThinking = false;

  function consume(raw: string) {
    const line = raw.trim();
    if (!nativeOllama && !line.startsWith("data:")) return;
    const payload = nativeOllama ? line : line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    if (parsed.error)
      throw new ZaiEngineError(
        String(typeof parsed.error === "string" ? parsed.error : parsed.error.message ?? "Answer engine stream failed"),
        response.status,
      );
    if (nativeOllama) {
      if (typeof parsed.message?.content === "string") text += parsed.message.content;
      if (parsed.message?.thinking) sawThinking = true;
      if (parsed.done_reason) finishReason = parsed.done_reason;
      return;
    }
    for (const choice of parsed.choices ?? []) {
      const fragment = choice.delta?.content ?? choice.message?.content;
      if (typeof fragment === "string") text += fragment;
      if (choice.delta?.reasoning || choice.delta?.reasoning_content) sawThinking = true;
      if (choice.finish_reason) finishReason = choice.finish_reason;
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
  return { text, finishReason, sawThinking };
}

export async function callZai(input: {
  system: string;
  user: string;
  knowledgeQuery?: string;
  includeInternalKnowledge?: boolean;
  imageDataUrl?: string;
  temperature?: number;
  fallbackProvider?: "free_cloud" | "zai_free";
  fallbackAttempted?: boolean;
}): Promise<ZaiCallResult> {
  const local = localLlmConfig();
  const freeCloudKey = process.env["OPENROUTER_API_KEY"]?.trim();
  const zaiKey = process.env["ZAI_API_KEY"]?.trim();
  const openaiEnabled =
    process.env["ASCENSION_ALLOW_OPENAI_AI"] === "true" &&
    Boolean(process.env["OPENAI_API_KEY"]?.trim());
  const provider =
    input.fallbackProvider ??
    (openaiEnabled ? "openai" : freeCloudKey ? "free_cloud" : zaiKey ? "zai_free" : local ? "local" : null);
  if (!provider) {
    throw new ZaiEngineError(
      "No answer engine is connected. Start ASCENSION local inference or explicitly authorize a provider.",
    );
  }

  let knowledgeText = "ASCENSION internal knowledge retrieval unavailable for this call.";
  let knowledgeResult: KnowledgeRetrievalResult | null = null;
  if (input.includeInternalKnowledge !== false)
    try {
      const query = (input.knowledgeQuery ?? input.user).replace(/\s+/g, " ").trim().slice(0, 300);
      knowledgeResult = await retrieveKnowledge(query, 6);
      knowledgeText = formatKnowledgeEvidence(knowledgeResult);
    } catch (cause) {
      knowledgeText = `ASCENSION internal knowledge retrieval failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    }

  const system =
    input.includeInternalKnowledge === false
      ? input.system
      : [
          input.system,
          "The ASCENSION INTERNAL KNOWLEDGE section comes from ASCENSION's own published Knowledgeverse, pathways, governance, ledger and chamber state.",
          "Use that internal knowledge as the primary context. Do not invent missing internal state.",
          "The application renders ASCENSION provenance separately. Do NOT emit fake source markers.",
        ].join(" ");
  const knowledgeForPrompt = provider === "local" ? knowledgeText.slice(0, 2400) : knowledgeText;
  const user =
    input.includeInternalKnowledge === false
      ? input.user
      : `${input.user}\n\nASCENSION INTERNAL KNOWLEDGE:\n${knowledgeForPrompt}`;

  if (provider === "openai") {
    const started = Date.now();
    try {
      const result = await callOpenAIResponse({
        system,
        user,
        ...(input.imageDataUrl ? { imageDataUrl: input.imageDataUrl } : {}),
        webSearch: false,
        timeoutMs: 24_000,
      });
      return {
        model: result.model,
        text: result.text,
        json: extractJson(result.text),
        duration_ms: Date.now() - started,
        knowledge: knowledgeResult,
      };
    } catch (cause) {
      throw new ZaiEngineError(
        "OpenAI answer inference failed: " + (cause instanceof Error ? cause.message : String(cause)),
      );
    }
  }

  const model =
    provider === "zai_free"
      ? input.imageDataUrl
        ? ZAI_FREE_VISION_MODEL
        : ZAI_FREE_TEXT_MODEL
      : zaiModel();
  const started = Date.now();
  const baseUrl =
    provider === "free_cloud" ? FREE_BASE_URL : provider === "zai_free" ? DEFAULT_BASE_URL : local!.baseUrl;
  const apiKey = provider === "free_cloud" ? freeCloudKey : provider === "zai_free" ? zaiKey : null;
  const nativeUrl = provider === "local" ? ollamaChatUrl(baseUrl) : null;
  let response: Response;
  try {
    response = await fetch(nativeUrl ?? `${baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(provider === "local" ? 180000 : 90000),
      headers:
        provider === "local"
          ? {
              "Content-Type": "application/json",
              Accept: nativeUrl ? "application/x-ndjson" : "text/event-stream",
            }
          : {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              Accept: "text/event-stream",
            },
      body: JSON.stringify({
        model,
        stream: true,
        ...(provider === "free_cloud"
          ? { provider: { data_collection: "deny", zdr: true, max_price: { prompt: 0, completion: 0 } } }
          : {}),
        ...(nativeUrl
          ? {
              ...(/(?:^|\/)qwen3(?:[:.-]|$)/i.test(model) ? { think: false } : {}),
              options: { temperature: input.temperature ?? 0.2, num_predict: LOCAL_MAX_TOKENS },
            }
          : {
              temperature: input.temperature ?? 0.2,
              ...(provider === "local" ? { max_tokens: LOCAL_MAX_TOKENS } : {}),
            }),
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: input.imageDataUrl
              ? [
                  { type: "text", text: user },
                  { type: "image_url", image_url: { url: input.imageDataUrl } },
                ]
              : user,
          },
        ],
      }),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    if (provider === "local") {
      throw new ZaiEngineError(`The local answer engine at ${local!.baseUrl} is unreachable (${detail}).`);
    }
    throw new ZaiEngineError(`Answer engine request failed: ${detail}`);
  }

  if (!response.ok) {
    if (!input.fallbackAttempted && [429, 502, 503, 504].includes(response.status)) {
      const alternative =
        provider === "zai_free" && freeCloudKey
          ? "free_cloud"
          : provider === "free_cloud" && zaiKey
            ? "zai_free"
            : null;
      if (alternative) {
        await response.body?.cancel().catch(() => undefined);
        return callZai({ ...input, fallbackProvider: alternative, fallbackAttempted: true });
      }
    }
    const detail = (await response.text().catch(() => "")).slice(0, 2000);
    throw new ZaiEngineError(
      `${provider === "local" ? `The local answer engine (${local!.baseUrl})` : "Answer engine"} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  const result = await readStream(response, Boolean(nativeUrl));
  const text = stripInlineReasoning(result.text);
  if (!text.trim()) {
    const detail =
      result.finishReason === "length"
        ? " exhausted its output limit before producing an answer"
        : result.sawThinking || /<think>/i.test(result.text)
          ? " returned thinking without a final answer"
          : " returned an empty response";
    throw new ZaiEngineError(
      `${provider === "local" ? "The local answer engine" : "Answer engine"}${detail}`,
      response.status,
    );
  }

  return {
    model,
    text,
    json: extractJson(text),
    duration_ms: Date.now() - started,
    knowledge: knowledgeResult,
  };
}
