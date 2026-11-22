/**
 * Voice instruction classification for the approved single-page ASCENSION Tree.
 * A command to continue is a QUESTION to the owner, never the change request
 * sent to the real local model. The owner's subsequent words are preserved.
 *
 * Pure and browser-independent so the intent flow is unit-testable.
 */
export function normalizedVoiceCommand(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[.,!?]+$/g, "").replace(/\s+/g, " ")
    : "";
}

export function isContinuationPrompt(value) {
  const text = normalizedVoiceCommand(value);
  return /^(?:(?:please )?(?:build on (?:this |the |my )?(?:result|intent|design)|continue (?:this |the |my )?(?:intent|design|result)|keep developing (?:this |the |my )?(?:intent|design|result)|make changes to (?:this |the |my )?(?:intent|design|result)))$/.test(text);
}

export function isDesignEditInstruction(value) {
  const text = normalizedVoiceCommand(value);
  return /^(?:(?:please |(?:can|could|would) you |i want (?:to |you to )|i(?: would|'d) like (?:to |you to ))?)(?:add|remove|replace|change|modify|improve|extend|reduce|adjust|redesign|make|move|resize|build on)\b/.test(text);
}

export function isCancelContinuation(value) {
  return /^(?:cancel|never mind|nevermind|stop|go back|keep it as it is)$/.test(
    normalizedVoiceCommand(value),
  );
}
