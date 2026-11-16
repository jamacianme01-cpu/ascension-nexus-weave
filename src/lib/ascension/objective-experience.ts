/** A personal-finance request must not be turned into an invention brief. */
export function isPersonalFinanceObjective(objective: string): boolean {
  const original=objective.split("\nBuild on the selected pathway:")[0] ?? objective;
  const explicitProduct=/\b(?:build|create|develop|design|make)\b.{0,70}\b(?:app|application|software|tool|platform|system|dashboard|robot|device)\b/i.test(original);
  return !explicitProduct && /\b(?:my|our)\s+(?:finances|budget|bills|debts?|money|spending|savings)\b|\b(?:financial|budgeting|debt)\s+(?:help|advice|guidance)\b|\bhelp\b.{0,35}\b(?:finances|paying bills|budgeting|debt)\b/i.test(original);
}

const CREATE = /\b(?:make|build|create|design|develop|invent|engineer|construct)\b/i;
const NAMED_PRODUCT = /\b(?:drones?|robots?|bots?|devices?|machines?|engines?|vehicles?|inventions?|apps?|applications?|software|hardware|platforms?|tools?|systems?)\b/i;
const ASKING_FOR_HELP = /\b(?:help|advice|repair|fix|troubleshoot|learn|explain|choose|compare)\b/i;

/** Any request to make something is a design, whatever the object is. */
export function isVisualDesignRequest(objective: string): boolean {
  const original = objective.split("\nBuild on the selected pathway:")[0] ?? objective;
  if (CREATE.test(original)) return true;
  return NAMED_PRODUCT.test(original) && !ASKING_FOR_HELP.test(original);
}
export function isInventionObjective(objective: string): boolean {
  return isVisualDesignRequest(objective);
}
export function objectiveExperience(objective: string, suggested?: string): "design"|"guidance" {
  if(isPersonalFinanceObjective(objective))return "guidance";
  if(isInventionObjective(objective))return "design";
  return suggested==="guidance"?"guidance":"design";
}

/** BUILD ON RESULT preserves the selected work in every approved category. */
export function revisionDirective(objective: string, section: "business"|"build"|"guidance"|null = null): string {
  if (!objective.includes("\nBuild on the selected pathway:")) return "";
  if (section === "business") return [
    "This is a continuation of the user's selected BUSINESS PLAN, not a new business idea.",
    "Preserve the selected strategy, facts, financial assumptions and completed actions from the supplied prior-result context.",
    "Apply only the user's latest change. When the user has already done a proposed step, advance to the next concrete implementation step.",
    "Provide an actionable sequence, dependencies, calculations using only real inputs, and specific deliverables; do not invent financial figures.",
    "Every alternative and BLEND must build on the selected plan, not restart with generic advice."
  ].join(" ");
  if (section === "guidance") return [
    "This is a continuation of the user's chosen GUIDANCE approach.",
    "Treat the user's follow-up literally and respond to its actual facts, not to a generic psychological interpretation.",
    "Preserve the selected approach and prior conversation; don't repeat suggestions the user already rejected or completed.",
    "Offer concrete, relevant next actions or a focused question if essential. No generic journaling, mindfulness or motivational script unless requested."
  ].join(" ");
  return [
    "This request revises an already selected design.",
    "The selected pathway and prior result context are binding architecture.",
    "Preserve the selected machine, its function, mobility, unit count, and power architecture.",
    "Apply only the requested Change or improve text; do not replace it with a different machine.",
  ].join(" ");
}
