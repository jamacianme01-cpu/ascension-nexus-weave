import { createMiddleware } from "@tanstack/react-start";

/** Authenticated server functions stay gated. This build has no Supabase session. */
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async () => {
  throw new Error("Authenticated ASCENSION routes are not configured in this build.");
});
