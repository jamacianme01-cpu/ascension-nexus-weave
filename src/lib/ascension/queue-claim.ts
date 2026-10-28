/**
 * Wire contract for the existing ASCENSION_CORE.cloud_queue_worker QueueClient.
 * The web form stores empty evidence/constraints as SQL NULL. Runtime requires
 * string arrays; preserve each submitted string exactly and map only NULL to [].
 * Never silently sanitize malformed non-null evidence into verified context.
 */
export function normalizeQueueContext(value: unknown, field: "evidence" | "constraints"): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError(`Invalid queued ${field}: expected array of strings or null`);
  }
  return value;
}

export function normalizeQueueClaim<T extends { evidence: unknown; constraints: unknown }>(
  item: T,
): T & { evidence: string[]; constraints: string[] } {
  return {
    ...item,
    evidence: normalizeQueueContext(item.evidence, "evidence"),
    constraints: normalizeQueueContext(item.constraints, "constraints"),
  };
}
