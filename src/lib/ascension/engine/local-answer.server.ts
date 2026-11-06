/**
 * ASCENSION's locally hosted V1 answer path.
 *
 * When the web server runs on the designated ASCENSION brain computer,
 * Ollama provides the answers. No model request is sent to a second PC or
 * silently routed to a paid provider. Hosted-only installations retain the
 * pre-existing explicitly permitted provider behavior.
 */
import { callOpenAIResponse, type OpenAIAnswer } from "./openai.server";

type RequestInput = Parameters<typeof callOpenAIResponse>[0];

export function localBrainConfigured(): boolean {
  return Boolean(process.env["LOCAL_LLM_BASE_URL"]?.trim());
}

function localEndpoint(): URL {
  const raw = process.env["LOCAL_LLM_BASE_URL"]?.trim();
  if (!raw) throw new Error("ASCENSION local brain has no model URL configured.");
  const base = new URL(raw);
  if (base.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(base.hostname) ||
      base.username || base.password || base.search || base.hash ||
      !["", "/", "/v1", "/v1/"].includes(base.pathname)) {
    throw new Error("ASCENSION local answer engine must be a loopback-only Ollama service.");
  }
  return new URL("/api/chat", base);
}

export async function callAscensionAnswer(input: RequestInput): Promise<OpenAIAnswer> {
  if (!localBrainConfigured()) return callOpenAIResponse(input);
  if (input.imageDataUrl || input.webSearch) {
    throw new Error("The local brain has no verified vision/web-search tool for this request.");
  }
  const model = process.env["LOCAL_LLM_MODEL"]?.trim() || "qwen3-ascension:latest";
  let response: Response;
  try {
    response = await fetch(localEndpoint(), {
      method: "POST",
      signal: AbortSignal.timeout(Math.max(8_000, Math.min(180_000, input.timeoutMs ?? 120_000))),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        ...(input.structuredOutput ? { format: input.structuredOutput.schema } : {}),
        options: { temperature: 0.25, num_predict: 6500 },
      }),
    });
  } catch (cause) {
    throw new Error("ASCENSION old-computer answer engine is unreachable: " +
      (cause instanceof Error ? cause.message : String(cause)));
  }
  if (!response.ok) {
    // Don't print the raw body: some model errors can contain private prompts.
    throw new Error("ASCENSION local answer engine returned HTTP " + response.status + ".");
  }
  const payload = await response.json() as {
    message?: { content?: string };
    done?: boolean;
    done_reason?: string;
  };
  const text = payload?.message?.content?.trim() || "";
  if (!text || payload.done === false) throw new Error("ASCENSION local answer engine returned no completed answer.");
  if (payload.done_reason === "length") throw new Error("ASCENSION local model answer was truncated.");
  return { model: "local:" + model, text, sources: [] };
}
