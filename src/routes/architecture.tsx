import { createFileRoute } from "@tanstack/react-router";
import { SystemArchitecture } from "@/components/ascension/system-architecture";

export const Route = createFileRoute("/architecture")({
  head: () => ({
    meta: [
      { title: "Architecture — ASCENSION" },
      {
        name: "description",
        content: "ASCENSION and CLARITY system architecture, governed engines, execution engines, epistemic chain, identity, Library Card and Knowledgeverse.",
      },
    ],
  }),
  component: () => <SystemArchitecture />,
});
