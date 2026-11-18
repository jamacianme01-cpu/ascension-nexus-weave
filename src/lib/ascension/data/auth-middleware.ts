import { createMiddleware } from "@tanstack/react-start";

function authenticatedRoutesConfigured(): boolean {
  return false;
}

/** Authenticated server functions stay gated. This build has no Ascension session. */
export const requireAscensionAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  if (!authenticatedRoutesConfigured()) {
    throw new Error("Authenticated ASCENSION routes are not configured in this build.");
  }
  const { ascensionDb } = await import("./client.server");
  return next({ context: { ascensionDb: ascensionDb, userId: "" } });
});
