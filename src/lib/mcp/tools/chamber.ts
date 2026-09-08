import { defineTool } from "@lovable.dev/mcp-js";
import { observation, published } from "../ascension-published";

export default defineTool({
  name: "ascension_chamber",
  title: "Chamber state",
  description:
    "Read the ASCENSION Chamber state: Destiny, ΔK/ΔU/ΔW, Guardian verdict, last verified transition, developmental/lifecycle state and manifestation readiness.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => observation(published.chamber),
});
