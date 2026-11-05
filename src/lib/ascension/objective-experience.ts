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

/** BUILD ON RESULT must extend the selected machine. The marker is part of the
 * objective sent back to pathway synthesis. */
export function revisionDirective(objective: string): string {
  if (!objective.includes("\nBuild on the selected pathway:")) return "";
  return [
    "This request revises an already selected design.",
    "The selected pathway title and the Preserve these features text are binding architecture.",
    "Every pathway and the blend must keep that machine, its mobility, its unit count, and its power architecture.",
    "Apply only the Change or improve text.",
    "Do not replace the invention with a different kind of machine or split it into separate products.",
  ].join(" ");
}
