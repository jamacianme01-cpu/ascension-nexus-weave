import { defineTool } from "../define-tool";
import { z } from "zod";
import { submitRequest } from "../execution-queue";

/**
 * Objective intake. This tool does NOT execute the ASCENSION cycle and cannot:
 * decomposition, DTF branching, evaluation, Guardian, selection, execution,
 * AutoSync verification, Δ and persistence all run inside the governed core on
 * the operator's runtime. Here we only record a signed submission the runtime
 * claims from the secured queue endpoint, and report back what it published.
 */
export default defineTool({
  name: "ascension_execute",
  title: "Submit objective for governed execution",
  description:
    "Submit an objective (with optional evidence and constraints) to the ASCENSION governed runtime. This records a signed submission in the operator's queue; the governed core claims it and runs its own cycle (Objective → Meaning Element decomposition → DTF branches → evaluation → Guardian → selection → execution → AutoSync verification → Δ → persistence). This tool never executes, evaluates, selects or writes governed state itself. Use ascension_run_status with the returned request_id to follow the run and read the Verified Δ once the runtime publishes it.",
  inputSchema: {
    objective: z
      .string()
      .describe("The objective / Destiny statement to submit, in the operator's own words."),
    evidence: z
      .array(z.string())
      .optional()
      .describe("Optional supporting evidence statements or references submitted with the objective."),
    constraints: z
      .array(z.string())
      .optional()
      .describe("Optional constraints to submit with the objective, e.g. 'without debt'."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ objective, evidence, constraints }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated. Sign in as an operator of this app." }],
        isError: true,
      };
    }
    const trimmed = objective.trim();
    if (!trimmed) {
      return { content: [{ type: "text", text: "objective must not be empty." }], isError: true };
    }

    const data = submitRequest({
      submitted_by: ctx.getUserId() ?? "unknown",
      submitted_via: "mcp",
      objective: trimmed.slice(0, 4000),
      evidence: evidence?.length ? evidence.map((item) => item.slice(0, 2000)) : null,
      constraints: constraints?.length ? constraints.map((item) => item.slice(0, 500)) : null,
    });

    const body = {
      accepted: true,
      executed_here: false,
      request_id: data.id,
      status: data.status,
      submission: data,
      note: "Recorded as a pending submission. The governed ASCENSION runtime claims and executes it; this web layer never runs the cycle, evaluates branches or writes governed state. Poll ascension_run_status for stage, Guardian verdict and Verified Δ.",
    };
    const text = JSON.stringify(body, null, 2);
    return { content: [{ type: "text", text }], structuredContent: JSON.parse(text) as never };
  },
});
