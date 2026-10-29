import { defineTool } from "../define-tool";
import { observation, published } from "../ascension-published";

export default defineTool({
  name: "ascension_pathways",
  title: "Pathways / DTF",
  description:
    "Read ASCENSION Pathways (DTF/Transverse): branch comparison, trajectory effects, confidence and uncertainty, constraints, emergence points, balance evaluation and any published Wisdom recommendation.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () =>
    observation({
      transition: published.semantic["transition"] ?? null,
      world_model: published.worldModel,
      chamber_manifestation: published.chamber["manifestation"] ?? null,
    }),
});
