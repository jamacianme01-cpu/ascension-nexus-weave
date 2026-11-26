import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired interface: old bookmarks return to the single approved Knowledgeverse.
// Governed runtime, observation APIs and saved knowledge remain unchanged.
export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({ next: typeof search.next === "string" ? search.next : "/" }),
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
});
