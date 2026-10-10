import { createFileRoute } from "@tanstack/react-router";
import { SystemArchitecture } from "@/components/ascension/system-architecture";
import { ConnectedKnowledgeWorld } from "@/components/ascension/knowledge-world";

export const Route = createFileRoute("/knowledgeverse")({
  head: () => ({
    meta: [
      { title: "Knowledgeverse — ASCENSION" },
      { property: "og:title", content: "Knowledgeverse — ASCENSION" },
      { property: "og:description", content: "The living ASCENSION Knowledgeverse: relationships, identity, verified delta and lineage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
