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
  // The old computer can take several minutes to assemble four structured
  // pathways. Stream Ollama's NDJSON instead of waiting for one delayed response
  // header, which previously failed even while the local process was running.
  const structured = Boolean(input.structuredOutput);
  const deadlineMs = structured ? 450_000 :
    Math.max(8_000, Math.min(180_000, input.timeoutMs ?? 120_000));
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(localEndpoint(), {
      method: "POST",
      signal: AbortSignal.timeout(deadlineMs),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: structured,
        think: false,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        ...(input.structuredOutput ? { format: input.structuredOutput.schema } : {}),
        options: { temperature: 0.25, num_predict: structured ? 2700 : 900 },
      }),
    });
  } catch (cause) {
    throw new Error("ASCENSION local model request failed after " +
      Math.round((Date.now() - started) / 1000) + " seconds (deadline " +
      Math.round(deadlineMs / 1000) + " seconds): " +
      (cause instanceof Error ? cause.message : String(cause)));
  }
  if (!response.ok) {
    throw new Error("ASCENSION local answer engine returned HTTP " + response.status + ".");
  }
  let text = "";
  if (structured) {
    if (!response.body) throw new Error("Ollama returned no pathway response stream.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let bytes = 0;
    let finished = false;
    let truncated = false;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const item = JSON.parse(line) as {
        message?: { content?: string }; done?: boolean; done_reason?: string;
        error?: string;
      };
      if (item.error) throw new Error("Ollama pathway generation failed: " + item.error.slice(0, 180));
      if (item.message?.content) text += item.message.content;
      if (item.done) {
        finished = true;
        truncated = item.done_reason === "length";
      }
    };
    try {
      while (!finished) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 4_000_000) throw new Error("Ollama returned oversized pathway output.");
        buffered += decoder.decode(next.value, { stream: true });
        let index: number;
        while ((index = buffered.indexOf("\n")) >= 0) {
          consume(buffered.slice(0, index).trim());
          buffered = buffered.slice(index + 1);
        }
      }
      buffered += decoder.decode();
      if (buffered.trim()) consume(buffered.trim());
    } catch (cause) {
      throw new Error("ASCENSION local pathway stream stopped after " +
        Math.round((Date.now() - started) / 1000) + " seconds (deadline " +
        Math.round(deadlineMs / 1000) + " seconds): " +
        (cause instanceof Error ? cause.message : String(cause)));
    } finally {
      reader.releaseLock();
    }
    if (!finished) throw new Error("Ollama stopped its pathway stream without completing.");
    if (truncated) throw new Error("ASCENSION local model answer was truncated.");
  } else {
    const payload = await response.json() as {
      message?: { content?: string }; done?: boolean; done_reason?: string;
    };
    text = payload?.message?.content?.trim() || "";
    if (payload.done === false) throw new Error("ASCENSION local answer engine returned an unfinished answer.");
    if (payload.done_reason === "length") throw new Error("ASCENSION local model answer was truncated.");
  }
  text = text.trim();
  if (!text) throw new Error("ASCENSION local answer engine returned no completed answer.");
  return { model: "local:" + model, text, sources: [] };
}
