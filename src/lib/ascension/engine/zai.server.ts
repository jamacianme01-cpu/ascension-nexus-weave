/**
 * Server-only Z.AI client.
 *
 * Z.AI is an EXTERNAL execution engine. Nothing here is ASCENSION governed
 * state: every response returned by this module is raw external output and must
 * be labelled as such by the caller. This module never writes governed state,
 * never invents a value and never rewrites an engine error.
 *
 * Calls are streamed so bytes keep flowing during long reasoning runs; the
 * accumulated text is returned once the stream completes. Requests are bounded to 90 seconds.
 */

const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";
const DEFAULT_MODEL = "glm-4.6";

export interface ZaiCallResult {
  model: string;
  text: string;
  /** Parsed JSON object when the engine returned one, otherwise null. */
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
  return process.env["ZAI_MODEL"]?.trim() || DEFAULT_MODEL;
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
      // fall through — the raw text is still returned verbatim
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

/** One streamed Z.AI chat call. Throws ZaiEngineError verbatim on failure. */
export async function callZai(input: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<ZaiCallResult> {
  const apiKey = process.env["ZAI_API_KEY"]?.trim();
  if (!apiKey) {
    throw new ZaiEngineError(
      "ZAI_API_KEY is not configured; the hosted Z.AI engine is unavailable.",
    );
  }

  const model = zaiModel();
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(`${zaiBaseUrl()}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(90000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: input.temperature ?? 0.2,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
    });
  } catch (cause) {
    throw new ZaiEngineError(
      `Z.AI request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 2000);
    throw new ZaiEngineError(
      `Z.AI returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  const text = await readStream(response);
  if (!text.trim()) {
    throw new ZaiEngineError("Z.AI returned an empty response", response.status);
  }

  return { model, text, json: extractJson(text), duration_ms: Date.now() - started };
}
