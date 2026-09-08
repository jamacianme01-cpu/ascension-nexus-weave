import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

/**
 * Read-only status of the operator's own submissions. Every field here is
 * written by the governed runtime through the secured queue endpoint; nothing
 * is inferred, defaulted or filled in by this web layer.
 */
export default defineTool({
  name: "ascension_run_status",
  title: "Run status",
  description:
    "Read the status of objectives submitted with ascension_execute: queued / claimed / running / verified / rejected / failed, the current stage reported by the governed runtime, Guardian verdict, outcome status, accepted Δ, transition id and runtime revision. Only the caller's own submissions are visible. Absent fields are absent, never inferred.",
  inputSchema: {
    request_id: z
      .string()
      .optional()
      .describe("Optional request_id returned by ascension_execute. Omit to list recent submissions."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Maximum number of recent submissions to return when no request_id is given. Defaults to 10."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ request_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated. Sign in as an operator of this app." }],
        isError: true,
      };
    }

    const supabase = supabaseForUser(ctx);
    const columns =
      "id, objective, evidence, constraints, status, stage, claimed_at, claimed_by, completed_at, runtime_revision, transition_id, accepted_delta, guardian_verdict, outcome_status, result, error, created_at, updated_at";

    const query = supabase.from("ascension_execution_requests").select(columns);
    const { data, error } = request_id
      ? await query.eq("id", request_id).limit(1)
      : await query
          .order("created_at", { ascending: false })
          .limit(Math.min(Math.max(limit ?? 10, 1), 50));

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    const body = {
      read_only: true,
      note: "Status fields are written only by the governed ASCENSION runtime. A submission that is still 'queued' has not been seen by the runtime yet.",
      items: data ?? [],
    };
    const text = JSON.stringify(body, null, 2);
    return { content: [{ type: "text", text }], structuredContent: JSON.parse(text) as never };
  },
});
