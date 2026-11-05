/** The public no-charge picture path.
 * A custom image endpoint can bill the owner, so it stays off until
 * ASCENSION_ALLOW_FREE_IMAGES is explicitly true. The anonymous SDXL route
 * does not. ASCENSION_ALLOW_FREE_IMAGES=false turns every picture off.
 */
export function freePictureEnabled(env: { allow?: string; endpoint?: string } = {}): boolean {
  if (env.allow === "false") return false;
  if (env.endpoint?.trim()) return env.allow === "true";
  return true;
}

const ASSIGNMENT = /^(?:please\s+)?(?:you(?:'d| would| should| need to| must)|the user should|start by|first(?:,| you should)?|next,?)?\s*(?:research|look up|study|read about|define|specify|identify|find out|investigate|survey|compare options for|shop for|go buy|acquire|purchase|choose your|decide your|figure out)(?:ing|s)?\b[:\s,-]*/i;

/** A design step states a choice already made. It does not assign research. */
export function asCompletedDesignStep(step: string): string {
  const text = step.replace(/\s+/g, " ").trim();
  if (!ASSIGNMENT.test(text)) return text;
  const rest = text.replace(ASSIGNMENT, "").replace(/^[\s,:.-]+/, "").replace(/[?.!]+$/, "").trim();
  if (rest.length < 8 || /^(?:your |the )?(?:requirements|design|it|this|system)\b/i.test(rest))
    return "This design already includes a provisional choice here. Measured values stay unresolved.";
  const body = rest.charAt(0).toLowerCase() + rest.slice(1);
  return `This design already uses ${body}.`;
}
