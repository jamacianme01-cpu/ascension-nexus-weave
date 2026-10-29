/** ASCENSION runtime error reporting (platform-independent). */
export type RuntimeErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  boundary?: string;
};

export function reportRuntimeError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error("[ASCENSION]", message, { stack, ...context });
}

/** @deprecated Use reportRuntimeError */
export const reportLovableError = reportRuntimeError;
