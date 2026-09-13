import { createFileRoute } from "@tanstack/react-router";

import { Engage } from "@/components/ascension/engage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ASCENSION — What do you want to accomplish?" },
      {
        name: "description",
        content:
          "Tell ASCENSION what you want to accomplish. ASCENSION works it through its governed engines and returns the actual result, growing your living Knowledgeverse.",
      },
      { property: "og:title", content: "ASCENSION" },
      {
        property: "og:description",
        content:
          "Objective in. Result out. A living Knowledgeverse formed from your destiny, history, relationships and verified experience.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  component: EngagePage,
});

function EngagePage() {
  return <Engage />;
}
