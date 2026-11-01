import { createMiddleware } from "@tanstack/react-start";

/** Authenticated server functions still fail closed. Public ASCENSION does not call Supabase. */
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async () => {
  throw new Error("Supabase is not connected. Public ASCENSION does not use it.");
});
