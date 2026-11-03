/** A personal-finance request must not be turned into an invention brief. */
export function isPersonalFinanceObjective(objective: string): boolean {
  const original=objective.split("\nBuild on the selected pathway:")[0] ?? objective;
  const explicitProduct=/\b(?:build|create|develop|design|make)\b.{0,70}\b(?:app|application|software|tool|platform|system|dashboard|robot|device)\b/i.test(original);
  return !explicitProduct && /\b(?:my|our)\s+(?:finances|budget|bills|debts?|money|spending|savings)\b|\b(?:financial|budgeting|debt)\s+(?:help|advice|guidance)\b|\bhelp\b.{0,35}\b(?:finances|paying bills|budgeting|debt)\b/i.test(original);
}
