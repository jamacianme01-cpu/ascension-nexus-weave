import { createFileRoute } from "@tanstack/react-router";
import { callOpenAIResponse } from "@/lib/ascension/engine/openai.server";

/** Railway-owned public intake: never calls Supabase or claims governed execution. */
type Part = { name: string; purpose: string; location: string };
type Path = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[] };
type Output = { introduction: string; pathways: Path[]; blend: Path & { blend_reason: string } };
type Contributor = { provider: "OpenAI" | "Claude" | "Grok"; answer: string };
const counters = new Map<string, { window: number; count: number }>();

function configured() {
  return {
    OpenAI: Boolean(process.env["OPENAI_API_KEY"]?.trim() && process.env["ASCENSION_ALLOW_OPENAI_AI"] === "true"),
    Claude: Boolean(process.env["ANTHROPIC_API_KEY"]?.trim()),
    Grok: Boolean(process.env["XAI_API_KEY"]?.trim()),
  };
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
function limit(key: string, max: number): boolean {
  const now = Date.now();
  const old = counters.get(key);
  const next = !old || now - old.window > 3600000 ? { window: now, count: 1 } : { window: old.window, count: old.count + 1 };
  counters.set(key, next);
  if (counters.size > 1000) for (const [k, v] of counters) if (now - v.window > 3600000) counters.delete(k);
  return next.count <= max;
}
function obj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
function parseText(text: string): Output {
  const stripped = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const first = stripped.indexOf("{"), last = stripped.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("The answer engine did not return structured pathways.");
  const top = obj(JSON.parse(stripped.slice(first, last + 1)));
  // The response schema has three mandatory, explicitly named approaches.
  // Convert them to the existing UI contract without fabricating content.
  const fixed = ["path_one", "path_two", "path_three"] as const;
  if (!Array.isArray(top["pathways"]) && fixed.every(key => Object.keys(obj(top[key])).length > 0)) {
    top["pathways"] = fixed.map((key, index) => ({ ...obj(top[key]), id: "p" + (index + 1) }));
  }
  const parsePath = (input: unknown): Path => {
    const p = obj(input);
    const strings = (key: string) => Array.isArray(p[key])
      ? (p[key] as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 6).slice(0, 8).map(v => v.slice(0, 650)) : [];
    const parts = Array.isArray(p["parts"]) ? p["parts"].slice(0, 12).map(raw => obj(raw)).filter(v =>
      typeof v["name"] === "string" && typeof v["purpose"] === "string").map(v => ({
        name: String(v["name"]).slice(0, 100), purpose: String(v["purpose"]).slice(0, 360),
        location: String(v["location"] ?? "").slice(0, 240),
      })) : [];
    return {
      id: String(p["id"] ?? "").slice(0, 30), title: String(p["title"] ?? "").slice(0, 140),
      summary: String(p["summary"] ?? "").slice(0, 1500),
      steps: strings("steps"), tradeoffs: strings("tradeoffs"), parts,
    };
  };
  if (!Array.isArray(top["pathways"]) || top["pathways"].length !== 3) throw new Error("Three pathways were not delivered.");
  const pathways = top["pathways"].map(parsePath);
  const blendRaw = obj(top["blend"]);
  const blend = { ...parsePath(blendRaw), blend_reason: String(blendRaw["blend_reason"] ?? "").slice(0, 1200) };
  const headings = pathways.map(p => p.title.trim().toLowerCase());
  if (pathways.some(p => !p.id || !p.title || p.summary.length < 35 || p.steps.length < 2) ||
    new Set(pathways.map(p => p.id)).size !== 3 || new Set(headings).size !== 3 ||
    !blend.title || blend.summary.length < 35 || blend.steps.length < 2 || !blend.blend_reason) {
    throw new Error("The answer was incomplete or the pathways were not distinct enough to display.");
  }
  return { introduction: String(top["introduction"] ?? "").slice(0, 1800), pathways, blend };
}
async function claude(objective: string): Promise<Contributor> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: AbortSignal.timeout(26000),
    headers: { "content-type": "application/json", "x-api-key": process.env["ANTHROPIC_API_KEY"] || "",
      "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env["ASCENSION_CLAUDE_MODEL"] || "claude-sonnet-4-5",
      max_tokens: 1600, messages: [{ role: "user", content: "Provide a substantive, practical, technically grounded proposed solution to this objective. State important tradeoffs. Do not claim implementation or verification. Objective: " + objective }] }),
  });
  if (!response.ok) throw new Error("Claude HTTP " + response.status);
  const payload = obj(await response.json());
  const text = (Array.isArray(payload["content"]) ? payload["content"] : []).map(raw => String(obj(raw)["text"] ?? "")).join("\n").trim();
  if (!text) throw new Error("Claude returned no answer.");
  return { provider: "Claude", answer: text.slice(0, 9000) };
}
async function grok(objective: string): Promise<Contributor> {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(26000),
    headers: { "content-type": "application/json", "authorization": "Bearer " + process.env["XAI_API_KEY"] },
    body: JSON.stringify({ model: process.env["ASCENSION_GROK_MODEL"] || "grok-4",
      max_tokens: 1600, messages: [{ role: "user", content: "Propose a concrete, technically grounded and meaningfully different method for accomplishing the objective. Include key components and limitations. Do not claim verified construction. Objective: " + objective }] }),
  });
  if (!response.ok) throw new Error("Grok HTTP " + response.status);
  const payload = obj(await response.json());
  const first = Array.isArray(payload["choices"]) ? obj(payload["choices"][0]) : {};
  const text = String(obj(first["message"])["content"] ?? "").trim();
  if (!text) throw new Error("Grok returned no answer.");
  return { provider: "Grok", answer: text.slice(0, 9000) };
}
/** A useful, readable first answer is independent of pathway JSON parsing. */
async function firstAnswer(objective: string) {
  if (!configured().OpenAI) throw new Error("OpenAI is not configured for the first answer.");
  const response = await callOpenAIResponse({
    timeoutMs: 26000,
    system: [
      "Give a substantive direct answer to the user's objective now.",
      "Focus on accomplishing the objective with specific useful details, a practical structure and key requirements.",
      "Do not return JSON or pathways yet. A separate stage will compare possible implementations.",
      "Keep the original user's terms and meaning. Do not substitute an unrelated topic.",
      "Never claim anything is built, tested, connected, or governed without evidence."
    ].join(" "),
    user: objective,
  });
  const answer = response.text.trim();
  if (answer.length < 45) throw new Error("The provider returned an incomplete initial answer.");
  return { phase: "initial" as const, answer: answer.slice(0, 14000), contributor: "OpenAI", verified: false };
}
/** Exact structural contract: the model cannot silently return two pathways instead of three. */
const componentSchema = {
  type: "object",
  properties: { name: { type: "string" }, purpose: { type: "string" }, location: { type: "string" } },
  required: ["name", "purpose", "location"],
  additionalProperties: false,
};
const pathwaySchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    tradeoffs: { type: "array", items: { type: "string" } },
    parts: { type: "array", items: componentSchema },
  },
  required: ["id", "title", "summary", "steps", "tradeoffs", "parts"],
  additionalProperties: false,
};
const outputSchema = {
  type: "object",
  properties: {
    introduction: { type: "string" },
    path_one: pathwaySchema,
    path_two: pathwaySchema,
    path_three: pathwaySchema,
    blend: {
      type: "object",
      properties: { ...pathwaySchema.properties, blend_reason: { type: "string" } },
      required: [...pathwaySchema.required, "blend_reason"],
      additionalProperties: false,
    },
  },
  required: ["introduction", "path_one", "path_two", "path_three", "blend"],
  additionalProperties: false,
};
async function build(objective: string, firstAnswerText = "") {
  const providerStatus = configured();
  if (!providerStatus.OpenAI) throw new Error("OpenAI answer provider is not configured on this server. No result was fabricated.");
  const external = await Promise.allSettled([
    providerStatus.Claude ? claude(objective) : Promise.resolve(null),
    providerStatus.Grok ? grok(objective) : Promise.resolve(null),
  ]);
  const sources: Contributor[] = [];
  const errors: string[] = [];
  for (const [i, result] of external.entries()) {
    if (result.status === "fulfilled" && result.value) sources.push(result.value);
    if (result.status === "rejected") errors.push((i === 0 ? "Claude" : "Grok") + " did not respond");
  }
  const allConnected = sources.length === 2;
  const response = await callOpenAIResponse({
    timeoutMs: 28500,
    structuredOutput: { name: "ascension_four_pathways", schema: outputSchema },
    system: [
      "You are drafting an ASCENSION creation result, not reporting execution or verification.",
      allConnected
        ? "Use three actual provider contributions, preserving their provenance. path_one is your independently developed OpenAI approach, informed by the initial OpenAI answer. path_two must faithfully structure CLAUDE\'S independently supplied proposal; path_three must faithfully structure GROK\'S independently supplied proposal. Never substitute your own different ideas for Claude or Grok or swap their approaches. Identify meaningful contradictions, compatibility, feasibility, tradeoffs and confidence limitations across all three before constructing the fourth blend. This analysis is external synthesis, NOT a claim the local governed ASCENSION engines ran."
        : "Only OpenAI is currently responding. Generate three genuinely distinct OpenAI-proposed pathways and a reasoned fourth blend. Never pretend Claude, Grok, Spiral, Guardian, or AutoSync supplied or verified them.",
      "Return exactly one JSON object with required keys: introduction, path_one, path_two, path_three, blend. Do NOT create a pathways array. Do NOT omit any of the three named approaches.",
      "path_one, path_two, and path_three are three substantively different approaches. Set ids p1,p2,p3 respectively. Every approach needs title, substantive summary (more than 35 characters), steps (3-5 detailed implementation steps), tradeoffs (at least one), parts (named components, purpose, location or [] when not relevant).",
      "blend is a fourth object with id blend, title, summary, steps, tradeoffs, parts and blend_reason explaining why specific strengths work together and what conflicting choices were rejected.",
      "Provide substance specific to the objective. Do not just describe an app interface or repeat the same concept three times.",
      "If the goal requires physical construction or unavailable capabilities, offer a usable conceptual design and label limits; never claim it was built or simulated.",
    ].join(" "),
    user: "OBJECTIVE (user wording is authoritative):\n" + objective +
      (firstAnswerText ? "\nINITIAL USER-FACING ANSWER TO BUILD ON (unverified):\n" + firstAnswerText.slice(0, 9000) : "") +
      (sources.length ? "\nINDEPENDENT MODEL ANSWERS (unverified):\n" + sources.map(s => s.provider + ":\n" + s.answer).join("\n\n") : ""),
  });
  const result = parseText(response.text);
  return {
    ...result,
    contributors: ["OpenAI", ...sources.map(s => s.provider)],
    unavailable: ["Claude", "Grok"].filter(provider => !sources.some(s => s.provider === provider)),
    providerErrors: errors,
    mode: allConnected ? "three-provider-synthesis" : "openai-only-provisional",
    verified: false,
    governance: "ASCENSION's local Meaning Elements, Spiral, Outcome Predictor, Guardian and AutoSync were not invoked by this hosted result.",
    persistence: "This hosted route does not use Supabase and does not persist objectives on the server.",
  };
}

/** Produce a real image for the selected pathway, never substitute diagram boxes.
 * A separate owner-controlled switch prevents surprise image-generation charges.
 */
async function picture(objective: string, value: Record<string, unknown>) {
  if (process.env["ASCENSION_ALLOW_PAID_IMAGES"] !== "true")
    throw new Error("Real invention image generation is not enabled by the owner. No image credits were charged.");
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!apiKey || !configured().OpenAI)
    throw new Error("The configured image provider is unavailable.");
  const title = String(value["title"] ?? "").trim().slice(0, 140);
  const summary = String(value["summary"] ?? "").trim().slice(0, 1500);
  const parts = Array.isArray(value["parts"]) ? value["parts"].slice(0, 12).map(raw => {
    const p = obj(raw);
    return [p["name"], p["purpose"], p["location"]].filter(x => typeof x === "string").join(": ").slice(0, 250);
  }) : [];
  if (title.length < 3 || summary.length < 35) throw new Error("A complete selected pathway is required.");
  const prompt = [
    "Create an accurate high-quality conceptual product illustration of the ACTUAL invention described below.",
    "One complete, fully assembled invention as a coherent object, shown clearly from a three-quarter view.",
    "The depicted subject must match the user's actual objective and selected approach, not generic boxes, a CORE diagram, or an abstract flowchart.",
    "For non-physical objectives, make an accurate, recognizable domain-specific illustration; do not fabricate hardware.",
    "No text, labels, numbers, watermarks, interfaces, exploded pieces or unrelated objects. Neutral background.",
    "User objective: " + objective.slice(0, 800),
    "Selected pathway: " + title,
    "Description: " + summary,
    "Required components and relationships: " + parts.join("; ").slice(0, 1700),
    "This is illustrative conceptual artwork, not a verified physical design or CAD model."
  ].join("\n");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    signal: AbortSignal.timeout(115000),
    headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model: process.env["ASCENSION_OPENAI_IMAGE_MODEL"]?.trim() || "gpt-image-1-mini",
      size: "1024x1024", quality: "low", n: 1, output_format: "png", prompt,
    }),
  });
  if (!response.ok) throw new Error("Invention image service returned HTTP " + response.status);
  const payload = obj(await response.json());
  const images = Array.isArray(payload["data"]) ? payload["data"] : [];
  const image = obj(images[0])["b64_json"];
  if (typeof image !== "string" || image.length < 1000)
    throw new Error("The image provider did not return an invention picture.");
  return { phase: "picture", image_url: "data:image/png;base64," + image, verified: false,
    description: "Concept illustration only; no physical model or CAD verification." };
}

export const Route = createFileRoute("/api/public/ascension/independent")({
  server: { handlers: {
    GET: async () => json({ answer_contract_version: "structured-four-20261028", providers: configured(), supabase_required: false,
      governed_runtime_connected: false, picture_generation_enabled: process.env["ASCENSION_ALLOW_PAID_IMAGES"] === "true", note: "Only configured providers can contribute. No provider or governed verification is invented." }),
    POST: async ({ request }) => {
      const origin = request.headers.get("origin");
      const fetchSite = request.headers.get("sec-fetch-site");
      const publicHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host).split(",")[0]!.trim().split(":")[0];
      if (fetchSite === "cross-site" || (origin && new URL(origin).hostname !== publicHost))
        return json({ error: "Cross-site requests are not permitted." }, 403);
      const address = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0]?.trim() || "unknown";
      if (!limit("global", 48) || !limit("ip:" + address, 12)) return json({ error: "Too many objectives. Try again later." }, 429);
      try {
        const raw = await request.text();
        if (raw.length > 15000) return json({ error: "Objective too long." }, 413);
        const input = obj(JSON.parse(raw));
        const objective = String(input["objective"] ?? "").trim();
        if (objective.length < 3 || objective.length > 2400) return json({ error: "Enter an objective between 3 and 2400 characters." }, 400);
        if (input["phase"] === "initial") return json(await firstAnswer(objective));
        if (input["phase"] === "picture") {
          if (!limit("image-ip:" + address, 4) || !limit("image-global", 24))
            return json({ error: "Image generation limit reached. No credits charged." }, 429);
          return json(await picture(objective, obj(input["pathway"])));
        }
        const prior = typeof input["firstAnswer"] === "string" ? input["firstAnswer"].slice(0, 9000) : "";
        return json(await build(objective, prior));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to generate a response.";
        console.error("[ASCENSION answer] " + message.slice(0, 600));
        return json({ error: message.slice(0, 400) }, 503);
      }
    },
  } },
});
