/**
 * Server-only INTERNAL reference-image generation for ENVISION image-to-3D.
 *
 * The image is never the user-facing ENVISION result. It is generated through
 * Lovable AI's native image endpoint, persisted to ASCENSION storage, and its
 * durable URL becomes the Hunyuan3D model job's source_image_url. Failures are
 * returned verbatim; nothing here substitutes placeholder geometry.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst";
const BUCKET = "ascension-models";

export interface ImageProviderInfo {
  provider: "lovable";
  model: string;
}

export function imageProvider(): ImageProviderInfo | null {
  return process.env["LOVABLE_API_KEY"]?.trim() ? { provider: "lovable", model: IMAGE_MODEL } : null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function persist(path: string, bytes: Uint8Array): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The bucket accepts GLB and octet-stream; the Hunyuan worker validates PNG bytes.
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/octet-stream", upsert: true });
  if (error) throw new Error(`reference image storage failed: ${error.message}`);
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Generate and persist one reference image. Throws the real provider/storage error. */
export async function generateConceptImage(prompt: string, storagePath: string): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"]?.trim();
  if (!key) throw new Error("Lovable AI is not available to this deployment (LOVABLE_API_KEY missing).");
  const response = await fetch(`${GATEWAY}/images/generations`, {
    method: "POST",
    // Internal reference generation must never strand ENGAGE in a permanent
    // running state. A failed/slow reference is reported and 3D remains pending.
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: prompt.replace(/\s+/g, " ").trim().slice(0, 3800),
      size: "1024x1024",
      quality: "medium",
    }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 800);
    throw new Error(`Lovable AI image generation returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ b64_json?: unknown }>;
  } | null;
  const b64 = payload?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || b64.length < 100)
    throw new Error("Lovable AI image generation returned no image data.");
  return persist(storagePath, base64ToBytes(b64));
}

/**
 * Generate reference images for pathways (bounded concurrency). Returns the
 * durable URLs plus the real error for every pathway that failed.
 */
export async function generatePathwayImages(
  objective: string,
  pathways: Array<{ id: string; label: string; summary: string; spiral_form?: string | null }>,
  requestId = "unscoped",
): Promise<{ urls: Map<string, string>; errors: string[] }> {
  const urls = new Map<string, string>();
  const errors: string[] = [];
  if (!pathways.length) return { urls, errors };
  if (!imageProvider()) {
    errors.push("Lovable AI is not available to this deployment (LOVABLE_API_KEY missing).");
    return { urls, errors };
  }
  const queue = [...pathways];
  const worker = async (): Promise<void> => {
    for (;;) {
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
        errors.push(`${pathway.label}: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
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
    .slice(0, 900);
  return [
    `Reference image for 3D reconstruction of the objective: "${objective.replace(/\s+/g, " ").trim().slice(0, 300)}".`,
    `Subject: ${subject}.`,
    "Show the single complete object with credible engineering detail, correct materials and components, three-quarter view, entire object in frame.",
    "Plain uniform light-grey background, soft even studio lighting, no text, no labels, no watermark, no other objects.",
  ].join(" ");
}
