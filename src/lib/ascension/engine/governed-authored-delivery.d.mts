/** Actual source-authored result projection, never planning or fallback geometry. */
export function selectGovernedAuthoredDelivery(
  source: unknown,
  objective: string,
  artifactFiles: (source: unknown) => Array<{name: string; content: string}>,
): Record<string, unknown> | null;
