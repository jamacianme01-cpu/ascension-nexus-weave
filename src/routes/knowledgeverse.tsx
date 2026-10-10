import { createFileRoute } from "@tanstack/react-router";
import { SystemArchitecture } from "@/components/ascension/system-architecture";
import { ConnectedKnowledgeWorld } from "@/components/ascension/knowledge-world";

export const Route = createFileRoute("/knowledgeverse")({
  head: () => ({
    meta: [
      { title: "Knowledgeverse — ASCENSION" },
      {
        name: "description",
        content:
          "ASCENSION architecture plus the living Knowledgeverse: CLARITY, ASCENSION, OMNI, governed engines, execution engines, identity, verified delta, relationships and lineage.",
      },
    ],
  }),
  ssr: false,
  component: () => (
    <div className="space-y-8">
      <SystemArchitecture />
      <ConnectedKnowledgeWorld />
    </div>
  ),
});
