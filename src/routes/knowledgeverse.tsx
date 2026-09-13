import { createFileRoute } from "@tanstack/react-router";
import { ConnectedKnowledgeWorld } from "@/components/ascension/knowledge-world";
export const Route = createFileRoute("/knowledgeverse")({
  head: () => ({
    meta: [
      { title: "Knowledgeverse — ASCENSION" },
      {
        name: "description",
        content:
          "Explore identity, genesis, relationships, possible futures and verified lineage in your living Knowledgeverse.",
      },
    ],
  }),
  ssr: false,
  component: () => <ConnectedKnowledgeWorld />,
});
