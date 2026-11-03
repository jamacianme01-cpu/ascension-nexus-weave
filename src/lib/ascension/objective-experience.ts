/** A personal-finance request must not be turned into an invention brief. */
export function isPersonalFinanceObjective(objective: string): boolean {
  const original=objective.split("\nBuild on the selected pathway:")[0] ?? objective;
  const explicitProduct=/\b(?:build|create|develop|design|make)\b.{0,70}\b(?:app|application|software|tool|platform|system|dashboard|robot|device)\b/i.test(original);
  return !explicitProduct && /\b(?:my|our)\s+(?:finances|budget|bills|debts?|money|spending|savings)\b|\b(?:financial|budgeting|debt)\s+(?:help|advice|guidance)\b|\bhelp\b.{0,35}\b(?:finances|paying bills|budgeting|debt)\b/i.test(original);
}

export function isInventionObjective(objective: string): boolean {
  const original=objective.split("\nBuild on the selected pathway:")[0] ?? objective;
  const product=/\b(?:drones?|robots?|bots?|devices?|machines?|engines?|vehicles?|inventions?|apps?|applications?|software|hardware|platforms?|tools?|systems?)\b/i;
  return product.test(original) && (/\b(?:make|build|create|design|develop|invent|engineer)\b/i.test(original) || !/\b(?:help|advice|repair|fix|troubleshoot|learn|explain|choose|compare)\b/i.test(original));
}
export function objectiveExperience(objective: string, suggested?: string): "design"|"guidance" {
  if(isInventionObjective(objective))return "design";
  if(isPersonalFinanceObjective(objective))return "guidance";
  return suggested==="guidance"?"guidance":"design";
}
