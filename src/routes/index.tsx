import { createFileRoute } from "@tanstack/react-router";
import { CrystalExperience } from "@/components/ascension/crystal-experience";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ASCENSION — What do you want to accomplish?" },
      { name: "description", content: "ASCENSION Library Card, living groundskeeper, and an evolving Tree of Knowledge. One intent, one growing crystal, governed knowledge and voice-guided invention inspection." },
      { property: "og:title", content: "ASCENSION" },
      { property: "og:type", content: "website" },
    ],
  }),
  ssr: false,
  component: CrystalExperience,
});
