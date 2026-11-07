import type { SelectedPathwayDesign } from "./design-image-brief";

type ImageFetch = typeof fetch;

/** Grok Imagine is the owner-selected image generator for ASCENSION V1.
 * The request is gated by both a server-side API key and explicit paid-image
 * enablement. There is deliberately no silent SDXL or other-image fallback.
 */
export function grokImagesEnabled(env: { key?: string; allow?: string } = {}): boolean {
  return Boolean(env.key?.trim()) && env.allow === "true";
}

export function grokAssemblyPrompt(
  objective: string,
  title: string,
  summary: string,
  design: SelectedPathwayDesign,
): string {
  const intro = design.count === 3
    ? "Render exactly three identical assembled machines in one coherent scene."
    : "Render exactly ONE complete, assembled machine with ONE continuous chassis.";
  const architecture = design.visibleAssemblies.length
    ? "Visible physical assembly: " + design.visibleAssemblies.join("; ") + "."
    : "Visible physical assembly: " + design.subject + ".";
  const components = design.parts.map(part => {
    const name = part.name.replace(/\s+/g, " ").trim();
    const location = part.location.replace(/\s+/g, " ").trim() || "unresolved placement";
    const purpose = part.purpose.replace(/\s+/g, " ").trim() || "function not specified";
    return "- " + name + " — location: " + location + "; purpose: " + purpose;
  }).join("\n");
  return [
    "ASCENSION V1: faithful product-assembly rendering from ONE selected design specification.",
    "The user requested: " + objective.split("\nBuild on the selected pathway:")[0]!.slice(0, 350) + ".",
    "SELECTED PATHWAY (do not substitute another invention): " + title.slice(0, 140) + ".",
    "DESIGN DESCRIPTION: " + summary.slice(0, 650) + ".",
    intro,
    "Render this machine: " + design.subject + ".",
    architecture,
    "The following are components of THIS machine, NOT separate inventions or objects:",
    components || "- No discrete parts supplied; do not invent additional modules.",
    "Show exterior-mounted parts integrated at their stated locations. Internal electronics must remain inside the body; do not depict them as free-floating items.",
    "Docking stations or external charging infrastructure, when listed, are not part of the assembled machine and must NOT appear as separate objects.",
    "Do not invent an additional rotor, wing, leg, vehicle, camera, or tool beyond the selected design. Preserve any explicitly stated rotor count.",
    "Make one realistic engineering concept image, three-quarter exterior view, plain neutral gray studio background. All external visible parts attached to one assembly. No cutaways, exploded views, collages, labels, text, diagrams, second product, or disconnected parts.",
    "Unspecified dimensions and hidden placements must not be represented as verified measured engineering."
  ].join("\n");
}

export type GrokImageOutput = { imageUrl: string; mime: "png" | "jpeg" | "webp"; bytes: Uint8Array };

export async function generateGrokAssemblyImage(
  prompt: string,
  key: string,
  request: ImageFetch = fetch,
): Promise<GrokImageOutput> {
  if (!key.trim()) throw new Error("Grok image generation requires XAI_API_KEY on the server.");
  const response = await request("https://api.x.ai/v1/images/generations", {
    method: "POST",
    signal: AbortSignal.timeout(95000),
    headers: {
      authorization: "Bearer " + key.trim(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      model: "grok-imagine-image-2.0",
      prompt,
      n: 1,
      aspect_ratio: "3:2",
      resolution: "1k",
      response_format: "b64_json",
    }),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error("Grok image service rejected the configured xAI API key.");
    if (response.status === 402) throw new Error("Grok image generation requires xAI billing credit.");
    if (response.status === 429) throw new Error("Grok image generation rate limit reached.");
    throw new Error("Grok image service returned HTTP " + response.status);
  }
  const raw = await response.text();
  if (raw.length > 16_000_000) throw new Error("Grok returned an oversized image response.");
  let result: { data?: { b64_json?: string; url?: string }[] };
  try { result = JSON.parse(raw); }
  catch { throw new Error("Grok image service did not return valid JSON."); }
  const first = result.data?.[0];
  const b64 = first?.b64_json?.replace(/^data:image\/(?:png|jpeg|webp);base64,/i, "") ?? "";
  // An image URL is intentionally insufficient: temporary off-site URLs are
  // not cached or exposed to the client as substitutes for verified image bytes.
  if (!/^[A-Za-z0-9+/=]{4000,12000000}$/.test(b64))
    throw new Error("Grok returned no usable image bytes. Expected b64_json response.");
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length < 3000 || bytes.length > 9_000_000)
    throw new Error("Grok image bytes exceed the accepted size limits.");
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const mime = png ? "png" : jpeg ? "jpeg" : webp ? "webp" : null;
  if (!mime) throw new Error("Grok returned a file that is not a supported image.");
  return { imageUrl: "data:image/" + mime + ";base64," + b64, mime, bytes };
}
