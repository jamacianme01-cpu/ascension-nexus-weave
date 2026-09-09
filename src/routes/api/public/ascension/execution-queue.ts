import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

import type { Json } from "@/integrations/supabase/types";

/**
 * Secured bridge between the objective queue and the operator's governed
 * ASCENSION runtime.
 *
 *   GET  — claim the oldest queued submission (marks it 'claimed').
 *   POST — report stage / result for a claimed submission.
 *
 * Only the shared ASCENSION_PUBLISH_TOKEN holder (the operator's runtime) may
 * call either. This endpoint never decides anything: it stores verbatim what
 * the governed core reports. The web layer cannot execute the cycle.
 */

const STATUSES = ["claimed", "running", "verified", "rejected", "failed"] as const;
type Status = (typeof STATUSES)[number];

function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function authorize(request: Request): Response | null {
  const expected = process.env["ASCENSION_PUBLISH_TOKEN"];
  if (!expected) return json({ error: "publish_token_not_configured" }, 503);
  const header =
    request.headers.get("x-ascension-publish-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  if (!tokenMatches(header, expected)) return json({ error: "unauthorized" }, 401);
  return null;
}

const optionalString = (value: unknown, max = 2000) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

export const Route = createFileRoute("/api/public/ascension/execution-queue")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = authorize(request);
        if (denied) return denied;

        const runner =
          optionalString(new URL(request.url).searchParams.get("runner"), 200) ?? "ascension-runtime";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: pending, error: readError } = await supabaseAdmin
          .from("ascension_execution_requests")
          .select("id, objective, evidence, constraints, submitted_by, submitted_via, created_at")
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(1);
        if (readError) return json({ error: "queue_read_failed" }, 500);

        const next = pending?.[0];
        if (!next) return json({ item: null }, 200);

        // Conditional claim so two runtime pollers cannot take the same item.
        const { data: claimed, error: claimError } = await supabaseAdmin
          .from("ascension_execution_requests")
          .update({
            status: "claimed",
            stage: "claimed_by_runtime",
            claimed_at: new Date().toISOString(),
            claimed_by: runner,
          })
          .eq("id", next.id)
          .eq("status", "queued")
          .select("id, objective, evidence, constraints, submitted_by, submitted_via, created_at")
          .maybeSingle();
        if (claimError) return json({ error: "claim_failed" }, 500);
        if (!claimed) return json({ item: null }, 200);

        return json({ item: claimed }, 200);
      },

      POST: async ({ request }) => {
        const denied = authorize(request);
        if (denied) return denied;

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const id = optionalString(body["request_id"], 64);
        if (!id) return json({ error: "request_id is required" }, 400);

        const status = body["status"];
        if (typeof status !== "string" || !STATUSES.includes(status as Status)) {
          return json({ error: `status must be one of ${STATUSES.join(", ")}` }, 400);
        }

        const revision = body["runtime_revision"];
        const terminal = status === "verified" || status === "rejected" || status === "failed";

        // Only fields the runtime actually sent are written. A progressive
        // report (stage → stage → verified) must never blank out values an
        // earlier report already published.
        type Patch = Record<string, string | number | boolean | Json | null | undefined>;
        const patch: Patch = { status };
        const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
        if (has("stage")) patch["stage"] = optionalString(body["stage"], 200);
        if (has("runtime_revision")) {
          patch["runtime_revision"] =
            typeof revision === "number" && Number.isInteger(revision) ? revision : null;
        }
        if (has("transition_id")) patch["transition_id"] = optionalString(body["transition_id"], 200);
        if (has("guardian_verdict")) {
          patch["guardian_verdict"] = optionalString(body["guardian_verdict"], 200);
        }
        if (has("outcome_status")) {
          patch["outcome_status"] = optionalString(body["outcome_status"], 200);
        }
        if (has("accepted_delta")) patch["accepted_delta"] = (body["accepted_delta"] ?? null) as Json;
        if (has("result")) patch["result"] = (body["result"] ?? null) as Json;
        if (has("error")) patch["error"] = optionalString(body["error"], 4000);
        if (terminal) patch["completed_at"] = new Date().toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("ascension_execution_requests")
          .update(patch)
          .eq("id", id)
          .select("id, status, stage, completed_at")
          .maybeSingle();
        if (error) return json({ error: "update_failed" }, 500);
        if (!data) return json({ error: "unknown_request_id" }, 404);

        return json({ ok: true, request: data }, 200);
      },
    },
  },
});
