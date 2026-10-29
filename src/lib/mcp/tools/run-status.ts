import { defineTool } from "../define-tool";
import { z } from "zod";
import { getRequest, listRequests } from "../execution-queue";

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

    if (request_id) {
      const data = getRequest(request_id);
      const body = {
        read_only: true,
        note: "Status fields are written only by the governed ASCENSION runtime. A submission that is still 'queued' has not been seen by the runtime yet.",
        items: data ? [data] : [],
      };
      const text = JSON.stringify(body, null, 2);
      return { content: [{ type: "text", text }], structuredContent: JSON.parse(text) as never };
    }

    const data = listRequests({ userId: ctx.getUserId() ?? undefined, limit });
    const body = {
      read_only: true,
      note: "Status fields are written only by the governed ASCENSION runtime. A submission that is still 'queued' has not been seen by the runtime yet.",
      items: data,
    };
    const text = JSON.stringify(body, null, 2);
    return { content: [{ type: "text", text }], structuredContent: JSON.parse(text) as never };
  },
});
