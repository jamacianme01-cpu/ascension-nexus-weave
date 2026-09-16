import { createFileRoute } from "@tanstack/react-router";

import { LibraryCardGate } from "@/components/ascension/library-card-gate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ASCENSION — What do you want to accomplish?" },
      {
        name: "description",
        content:
          "Tell ASCENSION what you want to accomplish. Personalized use begins from your Library Card; general questions may use basic pathway access without one.",
      },
      { property: "og:title", content: "ASCENSION" },
      {
        property: "og:description",
        content:
          "Library Card first for personalized ASCENSION. Objective in. Result out. Verified experience evolves the living Knowledgeverse.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  component: EngagePage,
});

function EngagePage() {
  return <LibraryCardGate />;
}
