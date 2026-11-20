import { createFileRoute } from "@tanstack/react-router";
import { IndependentEngage } from "@/components/ascension/independent-engage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ASCENSION — What do you want to accomplish?" },
      { name: "description", content: "ASCENSION Tree of Knowledge and Book: one continuous voice-guided experience with the owner's original governed intelligence and invention inspection." },
      { property: "og:title", content: "ASCENSION" },
      { property: "og:type", content: "website" },
    ],
  }),
  ssr: false,
  component: IndependentEngage,
});
