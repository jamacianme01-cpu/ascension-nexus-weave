/**
 * Read-only access to the bundled ASCENSION published/demo state for MCP tools.
 *
 * MCP tools run on the app server, which cannot reach the operator's local
 * Observation Gateway (that gateway is only reachable from the operator's own
 * browser). So these tools serve the bundled DEMO publication and label it
 * as such. They never mutate governed state and never fabricate a value.
 */
import chamber from "@/data/ascension/chamber_state.json";
import semantic from "@/data/ascension/semantic_state.json";
import entities from "@/data/ascension/entities.json";
import constraints from "@/data/ascension/constraints.json";
import evidence from "@/data/ascension/evidence.json";
import worldModel from "@/data/ascension/world_model.json";
import ledger from "@/data/ascension/ledger.json";
import knowledgeForms from "@/data/ascension/knowledge_forms.json";

export const SOURCE_CLASSIFICATION = "DEMO" as const;

export const published = {
  chamber: chamber as unknown as Record<string, unknown>,
  semantic: semantic as unknown as Record<string, unknown>,
  entities: entities as unknown as Record<string, Record<string, unknown>>,
  constraints: constraints as unknown as Record<string, unknown>,
  evidence: evidence as unknown as Record<string, unknown>,
  worldModel: worldModel as unknown as Record<string, unknown>,
  ledger: ledger as unknown as Array<Record<string, unknown>>,
  knowledgeForms: knowledgeForms as unknown as Array<Record<string, unknown>>,
};

/** Wrap a payload with honest provenance so a caller can never mistake it for LIVE_GOVERNED. */
export function observation(payload: unknown) {
  const body = {
    source_classification: SOURCE_CLASSIFICATION,
    read_only: true,
    note: "Bundled ASCENSION published demo state. Not LIVE_GOVERNED. Absent fields are absent, never inferred.",
    data: payload,
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
    structuredContent: body as Record<string, unknown>,
  };
}
