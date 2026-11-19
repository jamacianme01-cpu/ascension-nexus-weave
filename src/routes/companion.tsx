import { createFileRoute } from "@tanstack/react-router";

import { DementiaCompanion } from "@/components/ascension/dementia-companion";

export const Route = createFileRoute("/companion")({
  head: () => ({
    meta: [
      { title: "Companion — ASCENSION" },
      {
        name: "description",
        content: "A quiet reminder and check-in for a person living with dementia. One prompt at a time. No camera.",
      },
    ],
  }),
  ssr: false,
  component: DementiaCompanion,
});
