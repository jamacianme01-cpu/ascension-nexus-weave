import { createFileRoute } from "@tanstack/react-router";
import { IndependentEngage } from "@/components/ascension/independent-engage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ASCENSION — What do you want to accomplish?" },
      { name: "description", content: "ASCENSION Tree and Book: objective, three pathways, and a reasoned blend." },
      { property: "og:title", content: "ASCENSION" },
      { property: "og:type", content: "website" },
    ],
  }),
  ssr: false,
  component: IndependentEngage,
});
