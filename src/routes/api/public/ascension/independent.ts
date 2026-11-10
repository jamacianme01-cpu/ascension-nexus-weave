import { createFileRoute } from "@tanstack/react-router";
import {
  analystInstructions,
  independentTask,
  knowledgeverseDisposition,
  objectiveWork,
  pathwaySources,
  pictureStatus,
  providerStatusLine,
  sectionFrom,
  type ProviderName,
  type ProviderState,
  type Section,
  withoutProviderNames,
} from "@/lib/ascension/engine/organization";
import { callOpenAIResponse } from "@/lib/ascension/engine/openai.server";
import { callZai } from "@/lib/ascension/engine/zai.server";

/** Railway-owned public intake: never calls Supabase or claims governed execution. */
type Part = { name: string; purpose: string; location: string };
type Path = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[] };
type Analysis = { meaning: string[]; relationships: string[]; contradictions: string[]; outcomes: string[]; ascension_reasoning: string };
type Output = { introduction: string; pathways: Path[]; blend: Path & { blend_reason: string }; analysis: Analysis | null };
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
function cleanField(text: string, max: number): string {
  return withoutProviderNames(text).slice(0, max);
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
      ? (p[key] as unknown[]).map(v => typeof v === "string" ? cleanField(v, 650) : "").filter(v => v.length > 6).slice(0, 8) : [];
    const parts = Array.isArray(p["parts"]) ? p["parts"].slice(0, 12).map(raw => obj(raw)).filter(v =>
      typeof v["name"] === "string" && typeof v["purpose"] === "string").map(v => ({
        name: cleanField(String(v["name"]), 100) || "Part", purpose: cleanField(String(v["purpose"]), 360),
        location: cleanField(String(v["location"] ?? ""), 240),
      })) : [];
    return {
      id: String(p["id"] ?? "").slice(0, 30), title: cleanField(String(p["title"] ?? ""), 140) || "This approach",
      summary: cleanField(String(p["summary"] ?? ""), 1500),
      steps: strings("steps"), tradeoffs: strings("tradeoffs"), parts,
    };
  };
  if (!Array.isArray(top["pathways"]) || top["pathways"].length !== 3) throw new Error("Three pathways were not delivered.");
  const pathways = top["pathways"].map(parsePath);
  const blendRaw = obj(top["blend"]);
  const blend = { ...parsePath(blendRaw), blend_reason: cleanField(String(blendRaw["blend_reason"] ?? ""), 1200) };
  const analysisRaw = obj(top["analysis"]);
  const analysisList = (key: string) => Array.isArray(analysisRaw[key])
    ? (analysisRaw[key] as unknown[]).map(item => typeof item === "string" ? cleanField(item, 400) : "").filter(item => item.length > 8).slice(0, 6)
    : [];
  const analysis = {
    meaning: analysisList("meaning"),
    relationships: analysisList("relationships"),
    contradictions: analysisList("contradictions"),
    outcomes: analysisList("outcomes"),
    ascension_reasoning: cleanField(String(analysisRaw["ascension_reasoning"] ?? ""), 1200),
  };
  const analysisPresent = analysis.meaning.length + analysis.relationships.length + analysis.contradictions.length + analysis.outcomes.length > 0
    || analysis.ascension_reasoning.length > 35;
  const headings = pathways.map(p => p.title.trim().toLowerCase());
  if (pathways.some(p => !p.id || !p.title || p.summary.length < 35 || p.steps.length < 2) ||
    new Set(pathways.map(p => p.id)).size !== 3 || new Set(headings).size !== 3 ||
    !blend.title || blend.summary.length < 35 || blend.steps.length < 2 || !blend.blend_reason) {
    throw new Error("The answer was incomplete or the pathways were not distinct enough to display.");
  }
  return { introduction: cleanField(String(top["introduction"] ?? ""), 1800), pathways, blend, analysis: analysisPresent ? analysis : null };
}
async function claude(objective: string, section: Section | null): Promise<Contributor> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: AbortSignal.timeout(26000),
    headers: { "content-type": "application/json", "x-api-key": process.env["ANTHROPIC_API_KEY"] || "",
      "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env["ASCENSION_CLAUDE_MODEL"] || "claude-sonnet-4-5",
      max_tokens: 1600, messages: [{ role: "user", content: independentTask("Claude", section) + "\n\nObjective: " + objective }] }),
  });
  if (!response.ok) throw new Error("Claude HTTP " + response.status);
  const payload = obj(await response.json());
  const text = (Array.isArray(payload["content"]) ? payload["content"] : []).map(raw => String(obj(raw)["text"] ?? "")).join("\n").trim();
  if (!text) throw new Error("Claude returned no answer.");
  return { provider: "Claude", answer: text.slice(0, 9000) };
}
async function openai(objective: string, section: Section | null): Promise<Contributor> {
  const response = await callOpenAIResponse({
    timeoutMs: 26000,
    system: independentTask("OpenAI", section),
    user: objective,
  });
  const text = response.text.trim();
  if (!text) throw new Error("OpenAI returned no answer.");
  return { provider: "OpenAI", answer: text.slice(0, 9000) };
}
async function grok(objective: string, section: Section | null): Promise<Contributor> {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(26000),
    headers: { "content-type": "application/json", "authorization": "Bearer " + process.env["XAI_API_KEY"] },
    body: JSON.stringify({ model: process.env["ASCENSION_GROK_MODEL"] || "grok-4",
      max_tokens: 1600, messages: [{ role: "user", content: independentTask("Grok", section) + "\n\nObjective: " + objective }] }),
  });
  if (!response.ok) throw new Error("Grok HTTP " + response.status);
  const payload = obj(await response.json());
  const first = Array.isArray(payload["choices"]) ? obj(payload["choices"][0]) : {};
  const text = String(obj(first["message"])["content"] ?? "").trim();
  if (!text) throw new Error("Grok returned no answer.");
  return { provider: "Grok", answer: text.slice(0, 9000) };
}
/** Paid OpenAI only when the owner turned it on. Otherwise the free cloud route. */
async function draft(system: string, user: string, structured?: { name: string; schema: Record<string, unknown> }): Promise<string> {
  if (configured().OpenAI) {
    const response = await callOpenAIResponse({
      timeoutMs: 28500,
      system,
      user,
      ...(structured ? { structuredOutput: structured } : {}),
    });
    return response.text;
  }
  const response = await callZai({
    system,
    user,
    includeInternalKnowledge: false,
    knowledgeQuery: user.slice(0, 280),
  });
  return response.text;
}

/** A useful, readable first answer is independent of pathway JSON parsing. */
async function firstAnswer(objective: string, section: Section | null) {
  const text = await draft([
    "Give a substantive direct answer to the user's objective now.",
    objectiveWork(section),
    "Do not return JSON or pathways yet. A separate stage will compare possible implementations.",
    "Never claim anything is built, tested, connected, or governed without evidence."
  ].join(" "), objective);
  const answer = text.trim();
  if (answer.length < 45) throw new Error("The provider returned an incomplete initial answer.");
  return { phase: "initial" as const, answer: answer.slice(0, 14000), contributor: configured().OpenAI ? "OpenAI" : "free-route", verified: false };
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
    analysis: {
      type: "object",
      properties: {
        meaning: { type: "array", items: { type: "string" } },
        relationships: { type: "array", items: { type: "string" } },
        contradictions: { type: "array", items: { type: "string" } },
        outcomes: { type: "array", items: { type: "string" } },
        ascension_reasoning: { type: "string" },
      },
      required: ["meaning", "relationships", "contradictions", "outcomes", "ascension_reasoning"],
      additionalProperties: false,
    },
  },
  required: ["introduction", "path_one", "path_two", "path_three", "blend", "analysis"],
  additionalProperties: false,
};
async function build(objective: string, section: Section | null, firstAnswerText = "", memory = "") {
  const providerStatus = configured();
  const calls: Array<Promise<Contributor | null>> = [
    providerStatus.OpenAI ? openai(objective, section) : Promise.resolve(null),
    providerStatus.Claude ? claude(objective, section) : Promise.resolve(null),
    providerStatus.Grok ? grok(objective, section) : Promise.resolve(null),
  ];
  const external = await Promise.allSettled(calls);
  const names: ProviderName[] = ["OpenAI", "Claude", "Grok"];
  const states = {} as Record<ProviderName, ProviderState>;
  const sources: Contributor[] = [];
  const errors: string[] = [];
  names.forEach((provider, index) => {
    const configuredProvider = provider === "OpenAI" ? providerStatus.OpenAI : provider === "Claude" ? providerStatus.Claude : providerStatus.Grok;
    const result = external[index]!;
    if (!configuredProvider) states[provider] = "unavailable";
    else if (result.status === "fulfilled" && result.value) {
      states[provider] = "contributed";
      sources.push(result.value);
    } else {
      states[provider] = "failed";
      errors.push(provider + " did not respond");
    }
  });
  const ordered = names.flatMap(provider => sources.filter(source => source.provider === provider));
  let knowledgeText = "Knowledge retrieval did not return records. Do not invent Knowledgeverse records.";
  let knowledgeRetrieved = false;
  let evidenceCount = 0;
  let sourceRevision: number | null = null;
  try {
    const { retrieveKnowledge, formatKnowledgeEvidence } = await import("@/lib/ascension/engine/knowledge.server");
    const found = await retrieveKnowledge(objective, 6);
    knowledgeRetrieved = true;
    evidenceCount = found.evidence.length;
    sourceRevision = found.source_revision;
    knowledgeText = formatKnowledgeEvidence(found);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    knowledgeText = "Knowledge retrieval failed: " + message.slice(0, 300) + " Do not invent Knowledgeverse records.";
  }
  const knowledgeverse = { retrieved: knowledgeRetrieved, evidence_count: evidenceCount, source_revision: sourceRevision, ...knowledgeverseDisposition(knowledgeRetrieved) };
  const responseText = await draft([
      analystInstructions(section, states),
      "Return exactly one JSON object with required keys: introduction, path_one, path_two, path_three, blend. Do NOT create a pathways array. Do NOT omit any of the three named approaches.",
      "path_one, path_two, and path_three are three substantively different approaches. Set ids p1,p2,p3 respectively. Every approach needs title, substantive summary (more than 35 characters), steps (3-5 detailed implementation steps), tradeoffs (at least one), parts (named components, purpose, location or [] when not relevant).",
      "blend is a fourth object with id blend, title, summary, steps, tradeoffs, parts and blend_reason. It is ASCENSION's fourth pathway, not a fifth provider.",
      "analysis is required. meaning, relationships, contradictions, and outcomes are arrays of strings. ascension_reasoning states what ASCENSION kept, rejected, and developed beyond the external inputs.",
      "Keep the user's full description in the titles, summaries, and part names. If they say who it is for, where it is, or what condition it serves, those words stay.",
      "If the goal requires physical construction or unavailable capabilities, offer a usable conceptual design and label limits; never claim it was built or simulated.",
    ].join(" "),
    "OBJECTIVE (user wording is authoritative):\n" + objective +
      "\nKNOWLEDGEVERSE RETRIEVAL (recorded context, not a new verified outcome):\n" + knowledgeText.slice(0, 8000) +
      (firstAnswerText ? "\nINITIAL USER-FACING ANSWER TO BUILD ON (unverified):\n" + firstAnswerText.slice(0, 9000) : "") +
      (memory ? "\nTHIS USER'S KNOWLEDGEVERSE MEMORY (recorded relationships for this user only; not verified unless the line says verified):\n" + memory : "\nThis user has no earlier Knowledgeverse memory in this request.") +
      (ordered.length ? "\nEXTERNAL INPUTS (unverified answers, not the pathways):\n" + ordered.map(s => s.provider + ":\n" + s.answer).join("\n\n") : "\nNo external provider answer was supplied."),
    providerStatus.OpenAI ? { name: "ascension_four_pathways", schema: outputSchema as Record<string, unknown> } : undefined,
  );
  const result = parseText(responseText);
  const connectedCount = names.filter(provider => states[provider] === "contributed").length;
  const ascensionSource = pathwaySources();
  return {
    ...result,
    pathways: result.pathways.map((path, index) => ({ ...path, source: ascensionSource[index] })),
    blend: { ...result.blend, source: "ascension" as const },
    providers: states,
    contributors: names.filter(provider => states[provider] === "contributed"),
    unavailable: names.filter(provider => states[provider] !== "contributed"),
    providerErrors: errors,
    section,
    lead: section === "business" ? "Claude" : section === "build" ? "OpenAI" : section === "guidance" ? "Grok" : null,
    statusLine: providerStatusLine(states, section),
    mode: connectedCount === 3 ? "ascension-from-three-answers" : connectedCount > 0 ? "ascension-from-partial-answers" : "ascension-without-external-answers",
    verified: false,
    knowledgeverse,
    pictures: pictureStatus(process.env["ASCENSION_ALLOW_PAID_IMAGES"] === "true" && providerStatus.OpenAI),
    governance: "The external answers are inputs. This reading retrieves published Knowledgeverse records when they are reachable, then forms ASCENSION's own pathways. Guardian, AutoSync, and verified Delta persistence did not run.",
    persistence: knowledgeverse.reason,
  };
}

/** The picture is a reading of the user's full sentence. Paid image calls stay off. */
function picture(objective: string, value: Record<string, unknown>) {
  const parts = Array.isArray(value["parts"]) ? value["parts"].slice(0, 12).map(raw => obj(raw)).filter(part =>
    typeof part["name"] === "string").map(part => ({
      name: String(part["name"]).slice(0, 100),
      purpose: String(part["purpose"] ?? "").slice(0, 360),
      location: String(part["location"] ?? "").slice(0, 240),
    })) : [];
  return {
    phase: "picture" as const,
    paid: false,
    kind: "design-reading" as const,
    objective,
    title: String(value["title"] ?? "").slice(0, 140),
    summary: String(value["summary"] ?? "").slice(0, 1500),
    parts,
    note: "Interpretive design reading of the user's full sentence. Not a photograph and not a verified build.",
    pictures: pictureStatus(process.env["ASCENSION_ALLOW_PAID_IMAGES"] === "true" && configured().OpenAI),
  };
}

export const Route = createFileRoute("/api/public/ascension/independent")({
  server: { handlers: {
    GET: async () => json({ answer_contract_version: "structured-four-20261028", providers: configured(), supabase_required: false,
      sections: { business: "Claude", build: "OpenAI", guidance: "Grok" },
      governed_runtime_connected: false, picture_generation_enabled: process.env["ASCENSION_ALLOW_PAID_IMAGES"] === "true" && configured().OpenAI,
      picture_provider: "OpenAI", design_picture: "reading-of-user-words",
      note: "OpenAI, Claude, and Grok answer only when connected. Their answers are inputs. ASCENSION forms its own three pathways and the blend. Unverified results are not written into the Knowledgeverse. OpenAI is the Build picture provider. Paid pictures stay off unless explicitly enabled." }),
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
        const section = sectionFrom(input["section"]);
        if (input["phase"] === "initial") return json(await firstAnswer(objective, section));
        if (input["phase"] === "picture") {
          if (!limit("image-ip:" + address, 4) || !limit("image-global", 24))
            return json({ error: "Image generation limit reached. No credits charged." }, 429);
          return json(await picture(objective, obj(input["pathway"])));
        }
        const prior = typeof input["firstAnswer"] === "string" ? input["firstAnswer"].slice(0, 9000) : "";
        const memory = typeof input["memory"] === "string" ? input["memory"].slice(0, 4000) : "";
        return json(await build(objective, section, prior, memory));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to generate a response.";
        console.error("[ASCENSION answer] " + message.slice(0, 600));
        return json({ error: message.slice(0, 400) }, 503);
      }
    },
  } },
});
