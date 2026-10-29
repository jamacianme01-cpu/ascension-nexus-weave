import { createAPIFileRoute } from "@tanstack/react-start/api";
import {
  recordEngagement,
  getTreeSuggestion,
  type EngagementEvent,
} from "~/lib/ascension/engine/tree-preference.server";

export const APIRoute = createAPIFileRoute("/api/public/ascension/tree-signals")(
  {
    POST: async ({ request }) => {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "invalid_json" }, { status: 400 });
      }

      const event: EngagementEvent = {
        type: body?.type,
        objective: typeof body?.objective === "string" ? body.objective : undefined,
        pathwayId: typeof body?.pathwayId === "string" ? body.pathwayId : undefined,
        pathwayLabel: typeof body?.pathwayLabel === "string" ? body.pathwayLabel : undefined,
        meaningElements:
          Array.isArray(body?.meaningElements) &&
          body.meaningElements.every((m: unknown) => typeof m === "string")
            ? body.meaningElements
            : undefined,
        spiralForms:
          Array.isArray(body?.spiralForms) &&
          body.spiralForms.every((m: unknown) => typeof m === "string")
            ? body.spiralForms
            : undefined,
        timestamp: Date.now(),
      };

      if (!event.type || !isValidType(event.type)) {
        return Response.json({ error: "invalid_event_type" }, { status: 400 });
      }

      try {
        recordEngagement(event);
      } catch (err) {
        return Response.json(
          { error: "record_failed", detail: String(err) },
          { status: 500 },
        );
      }

      // Return a suggestion only when the preference layer says the Tree should speak.
      const suggestion = getTreeSuggestion(event);
      return Response.json({ ok: true, suggestion });
    },
  },
);

function isValidType(t: string): t is EngagementEvent["type"] {
  return (
    t === "select" ||
    t === "skip" ||
    t === "refine" ||
    t === "return" ||
    t === "engage"
  );
}
