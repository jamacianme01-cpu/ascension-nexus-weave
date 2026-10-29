import { defineTool } from "../define-tool";
import { z } from "zod";
import { observation, published } from "../ascension-published";

export default defineTool({{
  name: "ascension_ledger",
  title: "Verified Δ ledger",
  description:
    "Read the ASCENSION Verified Δ ledger records: hash-chain continuity (previous_hash → record_hash), execution receipts, verification state and transformation lineage.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Maximum number of most recent records to return. Defaults to all."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ limit }) =>
    observation({{
      ledger_entries: published.semantic["ledger_entries"] ?? null,
      ledger_valid: published.semantic["ledger_valid"] ?? null,
      records: limit ? published.ledger.slice(-limit) : published.ledger,
    }),
});
