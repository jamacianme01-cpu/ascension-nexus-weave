/**
 * Narrow owner-approved external answer adapter.
 * Never substitutes a model response for Guardian, AutoSync, Knowledgeverse,
 * CLARITY, or ASCENSION governed verification.
 *
 * No platform gateways, auto-selected free providers, or automatic billing.
 */
import { retrieveKnowledge, formatKnowledgeEvidence, type KnowledgeRetrievalResult } from "./knowledge.server";
import { callOpenAIResponse } from "./openai.server";

export interface ApprovedAnswerResult {
  model: string;
  text: string;
  json: Record<string, unknown> | null;
  duration_ms: number;
  knowledge: KnowledgeRetrievalResult | null;
}

export class ApprovedAnswerError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ApprovedAnswerError";
    this.status = status;
  }
}

function enabled(): boolean {
  return process.env["ASCENSION_ENABLE_PAID_APIS"] === "true" &&
    process.env["ASCENSION_ALLOW_OPENAI_AI"] === "true" &&
    Boolean(process.env["OPENAI_API_KEY"]?.trim());
}

export function approvedAnswerModel(): string {
  return enabled() ? (process.env["ASCENSION_OPENAI_MODEL"]?.trim() || "gpt-4.1-mini") : "not-connected";
}

function extractJson(raw: string): Record<string, unknown> | null {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = match?.[1] ?? raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * Explicitly approved OpenAI is the only optional web draft path.
 * Independently produced Claude and Grok contributions remain separate paths.
 * A configured key alone never authorizes this adapter to spend money.
 */
export async function callApprovedAnswer(input: {
  system: string;
  user: string;
  knowledgeQuery?: string;
  includeInternalKnowledge?: boolean;
  imageDataUrl?: string;
  temperature?: number;
}): Promise<ApprovedAnswerResult> {
  if (!enabled()) {
    throw new ApprovedAnswerError(
      "No owner-approved external draft provider enabled. Use the existing ASCENSION governed runtime.",
    );
  }
  let knowledge: KnowledgeRetrievalResult | null = null;
  let evidence = "";
  if (input.includeInternalKnowledge !== false) {
    try {
      knowledge = await retrieveKnowledge((input.knowledgeQuery ?? input.user).replace(/\s+/g, " ").slice(0, 300), 6);
      evidence = formatKnowledgeEvidence(knowledge);
    } catch {
      evidence = "ASCENSION internal knowledge is currently unavailable; do not invent it.";
    }
  }
  const system = input.includeInternalKnowledge === false ? input.system : [
    input.system,
    "Only cite recorded Knowledgeverse facts when the data is actually present.",
    "This external response is unverified and cannot claim governed execution.",
    "The original user's objective and terminology take priority.",
  ].join("\n");
  const user = evidence ? input.user + "\n\nASCENSION RECORDED KNOWLEDGE:\n" + evidence : input.user;
  const started = Date.now();
  try {
    const response = await callOpenAIResponse({
      system, user,
      ...(input.imageDataUrl ? {imageDataUrl:input.imageDataUrl} : {}),
      webSearch: false, timeoutMs: 24000,
    });
    return {
      model: response.model,
      text: response.text,
      json: extractJson(response.text),
      duration_ms: Date.now() - started,
      knowledge,
    };
  } catch (cause) {
    throw new ApprovedAnswerError(
      "Owner-approved external draft failed: " +
      (cause instanceof Error ? cause.message : String(cause)),
    );
  }
}
