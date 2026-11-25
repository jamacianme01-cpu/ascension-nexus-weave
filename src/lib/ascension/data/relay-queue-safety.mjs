/** Pure safety decisions shared by the native PostgreSQL transport and tests. */
export function shouldAcceptRelayRevision(latest, incoming) {
  if (!Number.isSafeInteger(incoming) || incoming < 0) return false;
  if (latest === null || latest === undefined) return true;
  return Number.isSafeInteger(Number(latest)) && incoming > Number(latest);
}

export function governedQueueTransition(previous, next) {
  if (!previous) return "missing";
  if (!["claimed", "running", "verified", "failed", "rejected"].includes(next))
    return "conflict";
  if (["verified", "failed", "rejected"].includes(previous))
    return previous === next ? "replayed" : "conflict";
  if (!["claimed", "running"].includes(previous)) return "conflict";
  if (previous === "running" && next === "claimed") return "conflict";
  return "updated";
}
