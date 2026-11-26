import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired interface: old bookmarks return to the single approved Knowledgeverse.
// Governed runtime, observation APIs and saved knowledge remain unchanged.
export const Route = createFileRoute("/_authenticated/objectives")({
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
});
