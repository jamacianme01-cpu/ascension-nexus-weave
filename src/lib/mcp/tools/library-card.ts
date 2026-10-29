import { defineTool, ToolError } from "../define-tool";
import { z } from "zod";
import { observation, published } from "../ascension-published";

export default defineTool({
  name: "ascension_library_card",
  title: "Library Card",
  description:
    "Read the Library Card / glossary record for one ASCENSION entity: ID, SID, WHO/WHAT/WHY, chromosome/genesis state where published, Meaning Elements, lineage and relationships.",
  inputSchema: {
    entity_id: z
      .string()
      .min(1)
      .describe("Entity ID, e.g. ENTITY:operator. Use ascension_knowledgeverse to list available IDs."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ entity_id }) => {
    const record = published.entities[entity_id];
    if (!record) {
      throw new ToolError(
        `No published record for entity "${entity_id}". Available: ${Object.keys(published.entities).join(", ")}`,
      );
    }
    return observation({ entity_id, record });
  },
});
