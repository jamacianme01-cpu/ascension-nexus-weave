/**
 * Fail-closed compatibility boundary for legacy authenticated server functions.
 *
 * ASCENSION V1 has no third-party authentication client. An authenticated
 * route must never silently become public just because that provider was
 * removed. Keep the old function exports linkable while an owner-controlled
 * authentication replacement is developed separately.
 */
import { createMiddleware } from "@tanstack/react-start";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async () => {
    throw new Error(
      "Authenticated legacy operations are unavailable in ASCENSION V1. " +
      "This operation requires an owner-authorized authentication replacement."
    );
  }
);
