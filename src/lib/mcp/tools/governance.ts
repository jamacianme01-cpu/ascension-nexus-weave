import { defineTool } from "../define-tool";
import { observation, published } from "../ascension-published";

export default defineTool({
  name: "ascension_governance",
  title: "Governance",
  description:
    "Read the ASCENSION governance layer: active constraints, applicable / remembered-not-applicable / superseded categories, Guardian state and the provenance and evidence basis.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () =>
    observation({
      constraints: published.constraints,
      evidence: published.evidence,
      constraint_governance:
        (published.semantic["transition"] as Record<string, unknown> | undefined)?.[
          "constraint_governance"
        ] ?? null,
      guardian: published.chamber["guardian"] ?? null,
    }),
});
