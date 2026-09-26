import { createFileRoute } from "@tanstack/react-router";

import { Engage } from "@/components/ascension/engage";
import { LibraryCardGate } from "@/components/ascension/library-card-gate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ASCENSION — What do you want to accomplish?" },
      {
        name: "description",
        content:
          "Tell ASCENSION what you want to accomplish. Your Book opens directly; Library Card is available when you want personalized context.",
      },
      { property: "og:title", content: "ASCENSION" },
      {
        property: "og:description",
        content:
          "Objective in. Result out. Verified experience evolves the living Knowledgeverse.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  component: EngagePage,
});

function EngagePage() {
  const library = typeof window !== "undefined" && new URL(window.location.href).searchParams.get("library") === "1";
  return library ? <LibraryCardGate /> : <Engage />;
}
