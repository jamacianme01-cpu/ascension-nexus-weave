/**
 * ASCENSION inference engine — independent of any platform.
 * Exports callZai / ZaiEngineError / zaiModel for existing imports.
 * Provider order: OpenAI (opt-in via ASCENSION_ALLOW_OPENAI_AI),
 * then OpenRouter free models, then LOCAL_LLM_BASE_URL.
 * Z.AI and Lovable keys are ignored even if present in env.
 */

import { request as httpRequest } from "node:http";

export class ZaiEngineError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ZaiEngineError';
  }
}

export function zaiModel(kind: 'flash' | 'pro' = 'flash'): string {
  if (kind === 'pro') {
    return process.env.ASCENSION_PRO_MODEL || process.env.OPENAI_PRO_MODEL || 'gpt-4o';
  }
  return process.env.ASCENSION_FLASH_MODEL || process.env.OPENAI_FLASH_MODEL || 'gpt-4o-mini';
}

interface CallZaiOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  jsonSchema?: Record<string, unknown>;
  system?: string;
  user?: string;
  knowledgeQuery?: string;
  imageDataUrl?: string;
}


type InferenceResult = { text: string; json: Record<string, unknown> | null; model: string; duration_ms: number };
function parseResult(text: string): Record<string, unknown> | null {
  try {
    const cleaned = text.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\x60{3}\s*$/, "");
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}
function postLocalJson(url: string, body: unknown, timeoutMs: number): Promise<Record<string, any>> {
  const target = new URL(url);
  const payload = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(payload.length) },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed: Record<string, any> = {};
        try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; }
        if ((res.statusCode ?? 500) >= 300) {
          reject(new ZaiEngineError("Local answer provider failed with HTTP " + res.statusCode + ". No result was fabricated.", res.statusCode ?? 500));
          return;
        }
        resolve(parsed);
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new ZaiEngineError("Local answer provider timed out. No result was fabricated.", 503));
    });
    req.on("error", (error) => reject(error instanceof ZaiEngineError ? error : new ZaiEngineError("Local answer provider failed: " + error.message + " No result was fabricated.", 503)));
    req.end(payload);
  });
}
export function callZai(input: CallZaiOptions): Promise<InferenceResult>;
export function callZai(system: string, user: string, options?: CallZaiOptions): Promise<string>;
export async function callZai(input: CallZaiOptions | string, user?: string, opts: CallZaiOptions = {}): Promise<InferenceResult | string> {
  const legacy = typeof input === "string";
  const options = legacy ? opts : input;
  const systemPrompt = legacy ? input : (input.system ?? "");
  const userPrompt = legacy ? (user ?? "") : (input.user ?? "");
  const started = Date.now();
  const model = options.model || zaiModel("flash");
  const output = (value: string): InferenceResult | string => legacy ? value : {
    text: value, json: parseResult(value), model, duration_ms: Date.now() - started,
  };
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 4096;

  // 1. OpenAI — only when explicitly allowed
  if (process.env.ASCENSION_ALLOW_OPENAI_AI === 'true' && process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: options.imageDataUrl
              ? [{ type: "text", text: userPrompt }, { type: "image_url", image_url: { url: options.imageDataUrl } }]
              : userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: options.jsonSchema
            ? { type: "json_schema", json_schema: { name: "ascension_result", strict: true, schema: options.jsonSchema } }
            : options.jsonMode ? { type: 'json_object' } : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return output(text);
      }
    } catch {
      // fall through
    }
  }

  // 2. OpenRouter free models
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env["ASCENSION_OPENROUTER_FREE_MODEL"]?.trim() || "openrouter/free",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          provider: { zdr: true, data_collection: "deny", max_price: { prompt: 0, completion: 0 } },
          temperature,
          max_tokens: maxTokens,
          response_format: options.jsonSchema
            ? { type: "json_schema", json_schema: { name: "ascension_result", strict: true, schema: options.jsonSchema } }
            : options.jsonMode ? { type: "json_object" } : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return output(text);
      }
    } catch {
      // fall through
    }
  }

  // 3. Local LLM endpoint
  if (process.env.LOCAL_LLM_BASE_URL) {
    try {
      const base = process.env.LOCAL_LLM_BASE_URL.replace(/\/$/, "");
      const root = base.replace(/\/v1$/, "");
      const endpoint = root.endsWith("/v1") ? `${root}/chat/completions` : `${root}/api/chat`;
      const localModel = process.env.LOCAL_LLM_MODEL?.trim() || model;
      const data = await postLocalJson(endpoint, {
        model: localModel,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        stream: false,
        format: options.jsonSchema ?? (options.jsonMode ? "json" : undefined),
        options: { temperature, num_predict: maxTokens },
      }, 15 * 60 * 1000);
      const text = data.message?.content ?? data.choices?.[0]?.message?.content;
      if (text) return output(text);
      throw new ZaiEngineError("Local answer provider returned no text. No result was fabricated.", 503);
    } catch (error) {
      if (error instanceof ZaiEngineError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ZaiEngineError("Local answer provider failed: " + message + " No result was fabricated.", 503);
    }
  }

  throw new ZaiEngineError(
    'No available inference provider. Set ASCENSION_ALLOW_OPENAI_AI + OPENAI_API_KEY, OPENROUTER_API_KEY, or LOCAL_LLM_BASE_URL.',
    503,
  );
}
