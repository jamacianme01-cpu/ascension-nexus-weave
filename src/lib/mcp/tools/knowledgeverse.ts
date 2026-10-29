import { defineTool } from "../define-tool";
import { z } from "zod";
import { observation, published } from "../ascension-published";

export default defineTool({{
  name: "ascension_knowledgeverse",
  title: "Knowledgeverse",
  description:
    "Read the ASCENSION Knowledgeverse: Meaning Elements, Knowledge Forms, relationships, emergence candidates, entity IDs/SIDs and lineage.",
  inputSchema: {
    include_knowledge_forms: z
      .boolean()
      .optional()
      .describe("Include the full published Knowledge Form documents (large). Defaults to false."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ include_knowledge_forms }) =>
    observation({{
      semantic: published.semantic,
      world_model: published.worldModel,
      entity_ids: Object.keys(published.entities),
      knowledge_forms: include_knowledge_forms
        ? published.knowledgeForms
        : published.knowledgeForms.map((form) => form["file"] ?? null),
    }),
});
