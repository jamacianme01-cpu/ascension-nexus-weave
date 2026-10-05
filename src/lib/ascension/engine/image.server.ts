/**
 * Server-only image generation for VISUAL objectives.
 *
 * A real external image-generation engine produces the concept art; nothing
 * here synthesizes placeholder geometry and nothing here writes governed
 * state. When no provider is configured, or the provider fails, this module
 * resolves to null and the caller keeps an honest fallback — it never
 * invents a URL.
 *
 * Provider chain (first configured wins):
 *   1. Z.AI images       — ZAI_API_KEY (+ optional ZAI_IMAGE_MODEL, ZAI_BASE_URL)
 *   2. OpenAI-compatible — IMAGE_API_KEY (+ optional IMAGE_BASE_URL, IMAGE_MODEL)
 */

const DEFAULT_ZAI_IMAGE_MODEL = "glm-image";
const DEFAULT_IMAGE_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1";
const IMAGE_TIMEOUT_MS = 90_000;

export interface ImageProviderInfo {
  provider: "zai" | "openai-compatible";
  model: string;
}

export function imageProvider(): ImageProviderInfo | null {
  const zaiKey = process.env["ZAI_API_KEY"]?.trim();
  if (zaiKey) {
    const baseUrl = process.env["ZAI_BASE_URL"]?.trim();
    // The Lovable AI gateway is chat-only; image generation needs a real
    // image endpoint, not a proxied chat completions URL.
    if (!baseUrl || !/gateway\.lovable\.dev/i.test(baseUrl)) {
      return {
        provider: "zai",
        model: process.env["ZAI_IMAGE_MODEL"]?.trim() || DEFAULT_ZAI_IMAGE_MODEL,
      };
    }
  }
  if (process.env["IMAGE_API_KEY"]?.trim()) {
    return {
      provider: "openai-compatible",
      model: process.env["IMAGE_MODEL"]?.trim() || DEFAULT_OPENAI_IMAGE_MODEL,
    };
  }
  return null;
}

function imageBaseUrl(info: ImageProviderInfo): string {
  if (info.provider === "zai") {
    return (process.env["ZAI_BASE_URL"]?.trim() || "https://api.z.ai/api/paas/v4").replace(
      /\/+$/,
      "",
    );
  }
  return (process.env["IMAGE_BASE_URL"]?.trim() || DEFAULT_IMAGE_BASE_URL).replace(/\/+$/, "");
}

function imageApiKey(info: ImageProviderInfo): string {
  return info.provider === "zai"
    ? (process.env["ZAI_API_KEY"]?.trim() ?? "")
    : (process.env["IMAGE_API_KEY"]?.trim() ?? "");
}

/**
 * Generate one concept image. Resolves to the hosted image URL on success,
 * or null when no provider is configured or the engine fails — callers must
 * treat null as "no asset" rather than substituting placeholder geometry.
 */
export async function generateConceptImage(prompt: string): Promise<string | null> {
  const info = imageProvider();
  if (!info) return null;
  const trimmed = prompt.replace(/\s+/g, " ").trim().slice(0, 3800);
  if (!trimmed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(`${imageBaseUrl(info)}/images/generations`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${imageApiKey(info)}`,
      },
      body: JSON.stringify({
        model: info.model,
        prompt: trimmed,
        // Concept plates read best landscape; engines that only support one
        // size will reject this and the call resolves null honestly.
        size: "1728x960",
        n: 1,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 1200);
      console.error(
        "[ASCENSION image] provider rejected generation",
        info.provider,
        info.model,
        response.status,
        detail,
      );
      return null;
    }
    const payload = (await response.json().catch(() => null)) as {
      data?: Array<{ url?: unknown; b64_json?: unknown }>;
    } | null;
    const url = payload?.data?.[0]?.url;
    return typeof url === "string" && /^https:\/\//i.test(url.trim()) ? url.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate concept images for a batch of pathways with bounded concurrency.
 * Resolves per-pathway hosted image URLs; pathways whose engine call failed
 * are simply absent from the result — callers keep an honest fallback.
 */
export async function generatePathwayImages(
  objective: string,
  pathways: Array<{ id: string; label: string; summary: string; spiral_form?: string | null }>,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (!imageProvider() || !pathways.length) return urls;
  const queue = [...pathways];
  const worker = async (): Promise<void> => {
    for (;;) {
      const pathway = queue.shift();
      if (!pathway) return;
      const url = await generateConceptImage(conceptImagePrompt(objective, pathway));
      if (url) urls.set(pathway.id, url);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
  return urls;
}

/**
 * Build the concept-art prompt for one pathway. The pathway label/summary are
 * the design authority — the prompt describes the actual subject with an
 * engineering concept-visualization treatment, never generic blocks.
 */
export function conceptImagePrompt(
  objective: string,
  pathway: { label: string; summary: string; spiral_form?: string | null },
): string {
  const subject = [pathway.label, pathway.summary]
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" — ")
    .slice(0, 900);
  return [
    `High-quality professional concept visualization for the objective: "${objective.replace(/\s+/g, " ").trim().slice(0, 300)}".`,
    `Subject: ${subject}.`,
    "Render the actual described hardware/design/mechanism with credible engineering detail, correct materials and components, clear structure and depth.",
    "Cinematic studio lighting, dark blue and gold high-tech palette, premium product-design concept art, sharp focus, highly detailed, no text labels, no watermarks.",
  ].join(" ");
}
