import { createFileRoute } from "@tanstack/react-router";
import {
  buildProfile,
  composeSuggestion,
  recordEngagement,
  type EngagementSignal,
} from "@/lib/ascension/engine/tree-preference.server";

const kinds = {
  select: "selected",
  skip: "skipped",
  refine: "refined",
  return: "returned",
  engage: "built_on",
} as const;

let signals: EngagementSignal[] = [];

export const Route = createFileRoute("/api/public/ascension/tree-signals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }

        const type = body["type"];
        if (typeof type !== "string" || !(type in kinds)) {
          return Response.json({ error: "invalid_event_type" }, { status: 400 });
        }

        const objective = typeof body["objective"] === "string" ? body["objective"] : undefined;
        const pathwayId = typeof body["pathwayId"] === "string" ? body["pathwayId"] : undefined;
        const pathwayLabel = typeof body["pathwayLabel"] === "string" ? body["pathwayLabel"] : undefined;
        const meaningElements = Array.isArray(body["meaningElements"])
          ? body["meaningElements"].filter((item): item is string => typeof item === "string")
          : [];
        signals = recordEngagement(signals, {
          kind: kinds[type as keyof typeof kinds],
          target: pathwayLabel ?? pathwayId ?? type,
          meaningElements,
          ...(objective !== undefined ? { objective } : {}),
          ...(pathwayId !== undefined ? { pathwayId } : {}),
        });
        const suggestion = composeSuggestion(buildProfile(signals), {
          ...(objective !== undefined ? { objective } : {}),
        });
        return Response.json({ ok: true, suggestion });
      },
    },
  },
});
