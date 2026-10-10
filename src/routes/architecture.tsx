import { createFileRoute } from "@tanstack/react-router";
import { SystemArchitecture } from "@/components/ascension/system-architecture";

export const Route = createFileRoute("/architecture")({
  head: () => ({
    meta: [
      { title: "Architecture — ASCENSION" },
      { property: "og:title", content: "Architecture — ASCENSION" },
      { property: "og:description", content: "ASCENSION and CLARITY governed engines, identity and Knowledgeverse architecture." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content: "ASCENSION and CLARITY system architecture, governed engines, execution engines, epistemic chain, identity, Library Card and Knowledgeverse.",
      },
    ],
  }),
  component: () => <SystemArchitecture />,
});
