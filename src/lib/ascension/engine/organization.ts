/**
 * ASCENSION's provider organization.
 * External models answer the objective. They are not the Knowledgeverse.
 * ASCENSION turns those answers into its own three pathways. The blend is the fourth.
 */

export const SECTIONS = [
  { id: "business", label: "Business Planner" },
  { id: "build", label: "Build / Create" },
  { id: "guidance", label: "Guidance" },
] as const;

export type Section = (typeof SECTIONS)[number]["id"];
export type ProviderName = "OpenAI" | "Claude" | "Grok";
export type ProviderState = "contributed" | "unavailable" | "failed";

const PROVIDERS: ProviderName[] = ["OpenAI", "Claude", "Grok"];
const PROVIDER_WORD = /\b(chat\s*gpt|open\s*ai|openai|claude|grok|anthropic)\b/gi;

export function sectionFrom(value: unknown): Section | null {
  return SECTIONS.some(section => section.id === value) ? value as Section : null;
}

export function sectionLabel(section: Section): string {
  return SECTIONS.find(item => item.id === section)?.label ?? section;
}

/** Specialty lead. The other providers still contribute when they are connected. */
export function leadFor(section: Section): ProviderName {
  if (section === "business") return "Claude";
  if (section === "build") return "OpenAI";
  return "Grok";
}

export function objectiveWork(section: Section | null): string {
  if (section === "business") {
    return "Produce a usable business plan covering operations, inventory, customer acquisition, expenses, margins, cash flow, profitability, improvements, projections, risks, and implementation. Use only figures the user supplied. Mark every other number as an assumption or as missing. Never invent revenue or guaranteed returns.";
  }
  if (section === "build") {
    return "Develop the thing the user asked for. State how it operates, its components, their physical arrangement, and the engineering requirements. Do not answer with an essay that only tells the user to go research the subject.";
  }
  if (section === "guidance") {
    return "Answer the actual question. Compare the options and give practical direction. Do not turn the request into a proposal to build another app.";
  }
  return "The objective may be an invention, a business, a decision, or a problem. Develop a useful approach for what was actually asked.";
}

/** One provider's own approach. The caller only sends this to that provider. */
export function independentTask(provider: ProviderName, section: Section | null): string {
  const lead = section
    ? `${sectionLabel(section)} is the section. ${leadFor(section)} leads it. You are ${provider}. Develop your own approach even when you are not the lead.`
    : `You are ${provider}. Develop your own approach.`;
  return [
    "Develop your own practical approach to the objective.",
    "Do not describe ASCENSION's screens or interface.",
    "Do not claim the result is built, tested, or verified.",
    "Keep the user's words for who it is for, where it is, and what it serves.",
    objectiveWork(section),
    lead,
  ].join(" ");
}

/**
 * ASCENSION's own reading. External answers are inputs.
 * The three pathways and the blend belong to ASCENSION.
 */
export function analystInstructions(section: Section | null, states: Record<ProviderName, ProviderState>): string {
  const contributed = PROVIDERS.filter(provider => states[provider] === "contributed");
  const missing = PROVIDERS.filter(provider => states[provider] !== "contributed");
  const inputs = contributed.length
    ? `These providers answered independently. Their answers are inputs only: ${contributed.join(", ")}. ${missing.length ? `These providers did not answer, so do not invent an answer for them: ${missing.join(", ")}.` : "All three answered."}`
    : "No independent OpenAI, Claude, or Grok answer was supplied. Develop the pathways from the objective and any retrieved Knowledgeverse records. Do not invent those providers' answers.";
  return [
    "The external answers are raw inputs. They are not the pathways.",
    "Develop ASCENSION's own answer. Turn the inputs into three distinct pathways using the supplied Knowledgeverse evidence, the meaning of the objective, the relationships you can support, the contradictions between the inputs, and the possible outcomes.",
    "Do not copy an external answer into a pathway. Do not assign a pathway to ChatGPT, Claude, or Grok.",
    inputs,
    "Return an analysis object with meaning, relationships, contradictions, outcomes, and ascension_reasoning. Use only the supplied answers and knowledge records. If knowledge retrieval found nothing, say so and do not invent Knowledgeverse records.",
    "The blend is the fourth pathway. It combines compatible strengths from the external inputs with ASCENSION's own reasoning. It is not another provider and not a fifth pathway.",
    "Titles, summaries, steps, parts, and the blend name the approach itself. Never write ChatGPT, OpenAI, Claude, Grok, or Anthropic in those fields.",
    "When this user's Knowledgeverse memory is supplied, use its relationships. Recorded memory is not verified unless that record says verified. Never use another user's memory.",
    "Do not claim Guardian, AutoSync, or a verified Delta ran. Do not claim this result was written into the shared governed Knowledgeverse.",
    objectiveWork(section),
  ].join(" ");
}

/** The readings are ASCENSION's. Provider names stay on the input status. */
export function pathwaySources(): ["ascension", "ascension", "ascension"] {
  return ["ascension", "ascension", "ascension"];
}

/** Verified outcomes are what enter the Knowledgeverse. This hosted reading is not one of them. */
export function knowledgeverseDisposition(retrieved: boolean): { written: false; reason: string } {
  return {
    written: false,
    reason: retrieved
      ? "Published Knowledgeverse records were read. This result is not a verified outcome, so it was not added to the Knowledgeverse."
      : "No Knowledgeverse records were added. This result is not a verified outcome.",
  };
}

export function providerStatusLine(
  states: Record<ProviderName, ProviderState>,
  section: Section | null,
): string {
  const providers = PROVIDERS.map(provider => {
    const state = states[provider];
    const word = state === "contributed"
      ? "contributed its own approach"
      : state === "failed"
        ? "did not respond"
        : "is not connected";
    return `${provider} ${word}`;
  }).join(". ");
  const specialty = section
    ? `${sectionLabel(section)}. ${leadFor(section)} leads this section. The other providers still answer when they are connected. `
    : "";
  return `${specialty}${providers}. Those answers are inputs. The four readings are ASCENSION's own. The blend is the fourth. Recorded memory stays with this user and is not verified knowledge.`;
}

/** Removes provider brands from a pathway field. The user's objective is not passed through here. */
export function withoutProviderNames(text: string): string {
  const cleaned = text
    .replace(PROVIDER_WORD, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .trim();
  return cleaned;
}

/** OpenAI is the Build picture provider. Nothing is generated unless that path is explicitly enabled. */
export function pictureStatus(enabled: boolean): { provider: "OpenAI"; enabled: boolean; note: string } {
  return {
    provider: "OpenAI",
    enabled,
    note: enabled
      ? "OpenAI is the Build picture provider. This response did not generate a picture."
      : "OpenAI is the Build picture provider. Picture generation is not enabled, so no picture was generated and none was invented.",
  };
}
