/**
 * Server-only INTERNAL reference-image generation for ENVISION image-to-3D.
 *
 * The image is never the user-facing ENVISION result. It is generated through
 * an explicitly authorized image provider, persisted to ASCENSION storage, and its
 * durable URL becomes the Hunyuan3D model job's source_image_url. Failures are
 * returned verbatim; nothing here substitutes placeholder geometry.
 *
 * Independent of Lovable, Z.AI, and Supabase. Providers: OpenAI when
 * ASCENSION_ALLOW_OPENAI_AI=true, otherwise ASCENSION_IMAGE_ENDPOINT.
 */

const BUCKET = "ascension-models";

export interface ImageProviderInfo {
  provider: "openai" | "custom";
  model: string;
}

/** Never bill image generation implicitly when a visitor opens a pathway. */
export function imageProvider(): ImageProviderInfo | null {
  if (process.env["ASCENSION_ALLOW_PAID_IMAGES"] !== "true") return null;
  const openaiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (openaiKey && process.env["ASCENSION_ALLOW_OPENAI_AI"] === "true") {
    return { provider: "openai", model: process.env["ASCENSION_IMAGE_MODEL"]?.trim() || "dall-e-3" };
  }
  const endpoint = process.env["ASCENSION_IMAGE_ENDPOINT"]?.trim();
  if (endpoint) {
    return { provider: "custom", model: process.env["ASCENSION_IMAGE_MODEL"]?.trim() || "custom" };
  }
  return null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function persist(storagePath: string, bytes: Uint8Array): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (error) throw new Error(`reference image storage failed: ${error.message}`);
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/** Generate and persist one reference image. Throws the real provider/storage error. */
export async function generateConceptImage(prompt: string, storagePath: string): Promise<string> {
  if (!imageProvider())
    throw new Error("Automatic paid image generation is disabled. Use an existing approved ASCENSION source image instead.");
  const info = imageProvider()!;
  const signal = AbortSignal.timeout(120_000);
  let response: Response | undefined;

  if (info.provider === "openai") {
    const key = process.env["OPENAI_API_KEY"]!.trim();
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: info.model,
          prompt: prompt.replace(/\s+/g, " ").trim().slice(0, 3800),
          size: "1024x1024",
          response_format: "b64_json",
        }),
      });
      if (response.ok) break;
      const detail = (await response.text().catch(() => "")).slice(0, 800);
      if (response.status !== 429 && response.status < 500 || attempt === 2) {
        throw new Error(`OpenAI image generation returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  } else {
    const endpoint = process.env["ASCENSION_IMAGE_ENDPOINT"]!.trim();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = process.env["ASCENSION_IMAGE_TOKEN"]?.trim();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(endpoint, {
        method: "POST",
        signal,
        headers,
        body: JSON.stringify({ model: info.model, prompt: prompt.replace(/\s+/g, " ").trim().slice(0, 3800) }),
      });
      if (response.ok) break;
      const detail = (await response.text().catch(() => "")).slice(0, 800);
      if ((response.status < 500 && response.status !== 429) || attempt === 2) {
        throw new Error(`Custom image generation returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  if (!response) throw new Error("Image generation returned no response.");

  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ b64_json?: unknown }>;
  } | null;
  const b64 = payload?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || b64.length < 100)
    throw new Error("Image generation returned no image data");
  return persist(storagePath, base64ToBytes(b64));
}

/** Generate reference images for pathways (bounded concurrency). */
export async function generatePathwayImages(
  objective: string,
  pathways: Array<{
    id: string;
    label: string;
    summary: string;
    spiral_form?: string | null;
  }>,
  requestId = "unscoped",
): Promise<{ urls: Map<string, string>; errors: string[] } {
  const urls = new Map<string, string>();
  const errors: string[] = [];
  if (!pathways.length) return { urls, errors };
  if (!imageProvider()) {
    errors.push("Automatic paid image generation is disabled. Existing approved images can still be used.");
    return { urls, errors };
  }
  const queue = [...pathways];
  const worker = async () => {
    for (;;)
      const pathway = queue.shift();
      if (!pathway) return;
      const safeId = pathway.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
      try {
        urls.set(
          pathway.id,
          await generateConceptImage(
            conceptImagePrompt(objective, pathway),
            `references/${requestId}/${safeId}-${Date.now()}.png`,
          ),
        );
      } catch (cause) {
        errors.push(`${pathway.label}: ${cause instanceof Error ? cause.message : String(cause)}`)}
  };
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
  return { urls, errors };
}

/** Prompt tuned as an image-to-3D reference: one object, plain background. */
export function conceptImagePrompt(
  objective: string,
  pathway: { label: string; summary: string; spiral_form?: string | null },
): string {
  const subject = [pathway.label, pathway.summary]
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" — ")
    .slice(0, 2400);
  const spatialConversion =
    /\b(camper|rv|motorhome|trailer|van|room|office|workspace|living space|interior|house|home|building|shop|workshop|shed|garage|cabin)\b/i.test(
      objective,
    ) &&
    /\b(convert|conversion|transform|remodel|renovate|reconfigure|redesign|layout|fit[- ]?out|modify|retrofit)\b/i.test(
      objective,
    );

  return [
    `Reference image for 3D reconstruction of the objective: "${objective.replace(/\s+/g, " ").trim().slice(0, 300)}".`,
    `Subject: ${subject}.`,
    spatialConversion
      ? "Show the complete converted space as one coherent cutaway/isometric 3D reality. Keep the shell and the pathway-specific office, living, sleeping, storage and circulation layout visible together so the user can inspect the arrangement."
      : "Show the complete requested subject and the pathway-specific arrangement, entire subject in frame. Use a visual representation appropriate to its actual domain and scale; schematic or conceptual structures must look schematic rather than like fabricated hardware.",
    "Preserve the original subject and user-defined terminology. The pathway is an approach to that same objective, never permission to substitute a different object or domain. Do not add unrelated parts simply because the objective says programmable.",
    "Plain uniform light-grey background, soft even studio lighting, no text, no labels, no watermark, no unrelated objects.",
  ].join(" ");
}
