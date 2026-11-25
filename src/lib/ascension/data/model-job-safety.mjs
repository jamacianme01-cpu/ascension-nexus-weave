/** Model worker reports may not reopen terminal jobs or create false successes. */
export function modelJobTransition(previous, next) {
  if (!["running", "completed", "failed"].includes(next)) return "conflict";
  if (previous === "completed" || previous === "failed")
    return previous === next ? "replayed" : "conflict";
  if (previous !== "claimed" && previous !== "running") return "conflict";
  return "updated";
}
