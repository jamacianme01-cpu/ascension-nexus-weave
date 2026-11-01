import { createFileRoute } from "@tanstack/react-router";
import {
  guideInstructionsWithProfile,
  buildProfile,
  composeSuggestion,
  shouldSuggest,
  recordEngagement,
  type EngagementSignal,
  type PreferenceProfile,
} from "@/lib/ascension/engine/guide-personality.server";

/**
 * Client-facing guide endpoint for IndependentEngage.
 * Takes raw speech text + context, returns guide-shaped text
 * weighted by the Tree preference profile. Never commands.
 */
function definedFields(body: {
  objective?: string;
  pathwayId?: string;
  spiralForm?: string;
  availablePathways?: string[];
}) {
  return {
    ...(body.objective !== undefined ? { objective: body.objective } : {}),
    ...(body.pathwayId !== undefined ? { pathwayId: body.pathwayId } : {}),
    ...(body.spiralForm !== undefined ? { spiralForm: body.spiralForm } : {}),
    ...(body.availablePathways !== undefined ? { availablePathways: body.availablePathways } : {}),
  };
}

export const Route = createFileRoute("/api/public/ascension/guide-say")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          text?: string;
          objective?: string;
          kind?: EngagementSignal["kind"];
          target?: string;
          meaningElements?: string[];
          pathwayId?: string;
          spiralForm?: string;
          availablePathways?: string[];
          signals?: EngagementSignal[];
        };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const text = (body.text ?? "").trim();
        const signals = Array.isArray(body.signals) ? body.signals : [];
        const profile: PreferenceProfile = buildProfile(signals);
        const fields = definedFields(body);

        if (body.kind && body.target) {
          recordEngagement(signals, {
            kind: body.kind,
            target: body.target,
            meaningElements: body.meaningElements ?? [],
            ...fields,
          });
        }

        const instructions = guideInstructionsWithProfile(profile);
        const json = (value: unknown, status = 200) =>
          new Response(JSON.stringify(value), {
            status,
            headers: { "content-type": "application/json" },
          });

        if (!text) {
          const suggestion = composeSuggestion(profile, fields);
          return json({ text: suggestion, instructions, profile });
        }

        let shaped = text;
        if (shouldSuggest(profile)) {
          const nudge = composeSuggestion(profile, fields);
          if (nudge) shaped = text + " " + nudge;
        }

        return json({ text: shaped, instructions, profile });
      },
    },
  },
});
