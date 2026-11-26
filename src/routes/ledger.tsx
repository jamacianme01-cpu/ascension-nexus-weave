import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired interface: old bookmarks return to the single approved Knowledgeverse.
// Governed runtime, observation APIs and saved knowledge remain unchanged.
export const Route = createFileRoute("/ledger")({
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
});
