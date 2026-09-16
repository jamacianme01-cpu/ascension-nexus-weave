import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const permission = z.enum(["read", "search", "write", "create", "execute", "control"]);

export default defineTool({
  name: "ascension_code_walker",
  title: "Code Walker",
  description:
    "Submit a permission-scoped capability-extension objective for an existing game, app, website, CAD project, automation, robotics system, or other software surface. Code Walker is the ASCENSION pathway for entering an authorized system, tracing architecture and dependencies, locating supported extension points, adding or connecting a capability, testing it, observing the real result, and sending evidence through governed verification. This web tool only records the request; the authorized ASCENSION runtime performs any actual file/app/code action.",
  inputSchema: {
    target: z.string().min(1).describe("The game, app, project, repository, device-side software, or other system to extend."),
    desired_capability: z.string().min(1).describe("The capability ASCENSION should add or connect."),
    system_type: z
      .enum(["game", "application", "website", "cad", "music", "robotics", "automation", "custom_software"])
      .optional()
      .describe("Known system type, when available."),
    source_reference: z
      .string()
      .optional()
      .describe("Authorized project/repository/folder/app/runtime reference. Do not include secrets."),
    permissions: z
      .array(permission)
      .optional()
      .describe("Permissions the user has granted ASCENSION for this source. Absence is not treated as permission."),
    evidence: z.array(z.string()).optional().describe("Optional known engine, framework, plugin/API, build, log, or runtime details."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ target, desired_capability, system_type, source_reference, permissions, evidence }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated. Sign in as an operator of this app." }],
        isError: true,
      };
    }

    const targetText = target.trim();
    const capabilityText = desired_capability.trim();
    if (!targetText || !capabilityText) {
      return {
        content: [{ type: "text", text: "target and desired_capability must not be empty." }],
        isError: true,
      };
    }

    const granted = [...new Set(permissions ?? [])];
    const submittedEvidence = [
      `CODE_WALKER_TARGET: ${targetText}`,
      system_type ? `CODE_WALKER_SYSTEM_TYPE: ${system_type}` : null,
      source_reference ? `AUTHORIZED_SOURCE_REFERENCE: ${source_reference.trim().slice(0, 1500)}` : null,
      `GRANTED_PERMISSIONS: ${granted.length ? granted.join(", ") : "none supplied"}`,
      ...(evidence ?? []).map((item) => item.trim()).filter(Boolean).map((item) => `SOURCE_EVIDENCE: ${item.slice(0, 1800)}`),
    ].filter((value): value is string => Boolean(value));

    const objective = `Use Code Walker to add or connect this capability to ${targetText}: ${capabilityText}`;
    const constraints = [
      "Operate only through explicitly user-authorized sources and permissions.",
      "Do not treat bypassing anti-cheat, authentication, access controls, or other protections as an extension point.",
      "Trace and map the existing system before modification; preserve unrelated behavior.",
      "Do not call the capability added until actual runtime evidence is observed and AutoSync/governed verification accepts it.",
    ];

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("ascension_execution_requests")
      .insert({
        submitted_by: ctx.getUserId(),
        submitted_via: "mcp",
        objective: objective.slice(0, 4000),
        evidence: submittedEvidence,
        constraints,
      })
      .select("id, status, objective, evidence, constraints, created_at")
      .single();

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    const body = {
      accepted: true,
      executed_here: false,
      mode: "CODE_WALKER",
      request_id: data.id,
      status: data.status,
      target: targetText,
      desired_capability: capabilityText,
      granted_permissions: granted,
      submission: data,
      note: "The request is queued for the authorized ASCENSION runtime. This web layer does not access the device, modify files, launch the target, or claim verification. Follow the request with ascension_run_status.",
    };
    const text = JSON.stringify(body, null, 2);
    return { content: [{ type: "text", text }], structuredContent: JSON.parse(text) as never };
  },
});
