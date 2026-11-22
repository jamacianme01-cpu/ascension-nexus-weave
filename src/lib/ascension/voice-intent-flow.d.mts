/** Local, pure voice classification; no network or model inference. */
export function normalizedVoiceCommand(value: unknown): string;
export function isContinuationPrompt(value: unknown): boolean;
export function isDesignEditInstruction(value: unknown): boolean;
export function isCancelContinuation(value: unknown): boolean;
