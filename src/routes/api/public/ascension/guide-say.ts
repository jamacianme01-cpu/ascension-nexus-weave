import { createAPIFileRoute } from "@tanstack/react-start/api";
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
export const APIRoute = createAPIFileRoute("/api/public/ascension/guide-say")(
  {
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

      // Record this engagement if provided
      if (body.kind && body.target) {
        recordEngagement(signals, {
          kind: body.kind,
          target: body.target,
          meaningElements: body.meaningElements ?? [],
          objective: body.objective,
          pathwayId: body.pathwayId,
          spiralForm: body.spiralForm,
        });
      }

      const instructions = guideInstructionsWithProfile(profile);

      // If no text, just return a preference-weighted suggestion
      if (!text) {
        const suggestion = composeSuggestion(profile, {
          objective: body.objective,
          availablePathways: body.availablePathways,
        });
        return new Response(
          JSON.stringify({ text: suggestion, instructions, profile }),
          { headers: { "content-type": "application/json" } },
        );
      }

      // Shape the text through guide personality: keep it, add one nudge if timing allows
      let shaped = text;
      if (shouldSuggest(profile)) {
        const nudge = composeSuggestion(profile, {
          objective: body.objective,
          availablePathways: body.availablePathways,
        });
        if (nudge) shaped = text + " " + nudge;
      }

      return new Response(
        JSON.stringify({ text: shaped, instructions, profile }),
        { headers: { "content-type": "application/json" } },
      );
    },
  },
);
