import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { authorizeAscensionHub } from "@/lib/ascension/hub-auth.server";

import type { Database, Json } from "@/integrations/supabase/types";
import { assessResult, parseDelivery, type ObjectiveDelivery } from "@/lib/ascension/result-model";

type QueuePatch = Database["public"]["Tables"]["ascension_execution_requests"]["Update"];

/**
 * Secured bridge between the objective queue and the operator's governed
 * ASCENSION runtime.
 *
 *   GET  — claim the oldest queued submission (marks it 'claimed').
 *   POST — report stage / result for a claimed submission. A runtime may also
 *           attach the exact UTF-8 artifact bodies produced by that governed
 *           run; those are stored separately from the core result so the web
 *           layer never mutates the governed result payload.
 *
 * Only the shared ASCENSION_PUBLISH_TOKEN holder (the operator's runtime) may
 * call either. This endpoint never decides anything: it stores verbatim what
 * the governed core reports plus a separately labelled artifact transport
 * record. The web layer cannot execute the cycle.
 */

const STATUSES = ["claimed", "running", "verified", "rejected", "failed"] as const;
type Status = (typeof STATUSES)[number];
const ARTIFACT_ORDINAL = 101;
const ARTIFACT_LABEL = "GOVERNED_RUNTIME_ARTIFACTS";
const MAX_ARTIFACTS = 8;
const MAX_ARTIFACT_CHARS = 100000;

type ArtifactPayload = {
  name: string;
  content: string;
  bytes: number;
  sha256: string;
};

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

async function authorize(request: Request): Promise<Response | null> {
  // A separately paired 48-byte device key is preferred and needs no legacy
  // publish-token environment variable. Keep older connectors working only
  // while they still have a valid configured legacy secret.
  const hubKey = request.headers.get("x-ascension-hub-key");
  const compatibleKey = request.headers.get("x-ascension-publish-token");
  if (hubKey || (compatibleKey && /^[a-f0-9]{96}$/i.test(compatibleKey))) {
    const checked = await authorizeAscensionHub(request);
    if (!checked || hubKey) return checked;
    // Compatibility: continue to legacy if it was a 96-char legacy key.
  }
  const expected = process.env["ASCENSION_PUBLISH_TOKEN"];
  if (!expected) return json({error:"hub_not_paired"},401);
  const token = compatibleKey ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i,"") ?? null;
  if (!tokenMatches(token,expected)) return json({error:"unauthorized"},401);
  return null;
}

const optionalString = (value: unknown, max = 2000) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

function normalizeArtifacts(value: unknown): { files: ArtifactPayload[] } | { error: string } {
  if (!Array.isArray(value)) return { error: "artifacts must be an array" };
  if (value.length > MAX_ARTIFACTS) return { error: `artifacts may contain at most ${MAX_ARTIFACTS} files` };

  const names = new Set<string>();
  const files: ArtifactPayload[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "each artifact must be an object" };
    const artifact = raw as Record<string, unknown>;
    const name = typeof artifact["name"] === "string" ? artifact["name"].trim() : "";
    const content = typeof artifact["content"] === "string" ? artifact["content"] : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name) || name.includes("..")) {
      return { error: "artifact name is invalid" };
    }
    const lower = name.toLowerCase();
    if (names.has(lower)) return { error: "artifact names must be unique" };
    if (!content || content.length > MAX_ARTIFACT_CHARS) return { error: "artifact content is empty or too large" };

    const bytes = Buffer.byteLength(content, "utf8");
    const digest = createHash("sha256").update(content, "utf8").digest("hex");
    const reportedBytes = artifact["bytes"];
    if (reportedBytes !== undefined && reportedBytes !== null && reportedBytes !== bytes) {
      return { error: `artifact byte count mismatch for ${name}` };
    }
    const reportedHash =
      typeof artifact["sha256"] === "string"
        ? artifact["sha256"].trim().toLowerCase().replace(/^sha256:/, "")
        : null;
    if (reportedHash && reportedHash !== digest) return { error: `artifact sha256 mismatch for ${name}` };

    names.add(lower);
    files.push({ name, content, bytes, sha256: `sha256:${digest}` });
  }
  return { files };
}

export const Route = createFileRoute("/api/public/ascension/execution-queue")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await authorize(request);
        if (denied) return denied;

        const runner =
          optionalString(new URL(request.url).searchParams.get("runner"), 200) ?? "ascension-runtime";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: pending, error: readError } = await supabaseAdmin
          .from("ascension_execution_requests")
          .select("id, objective, evidence, constraints, submitted_by, submitted_via, created_at")
          .eq("engine", "governed_runtime")
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
          .eq("engine", "governed_runtime")
          .eq("status", "queued")
          .select("id, objective, evidence, constraints, submitted_by, submitted_via, created_at")
          .maybeSingle();
        if (claimError) return json({ error: "claim_failed" }, 500);
        if (!claimed) return json({ item: null }, 200);

        return json({ item: claimed }, 200);
      },

      POST: async ({ request }) => {
        const denied = await authorize(request);
        if (denied) return denied;

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_json_object" }, 400);
        const id = optionalString(body["request_id"], 64);
        if (!id) return json({ error: "request_id is required" }, 400);

        const status = body["status"];
        if (typeof status !== "string" || !STATUSES.includes(status as Status)) {
          return json({ error: `status must be one of ${STATUSES.join(", ")}` }, 400);
        }

        const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
        const normalizedArtifacts = has("artifacts") ? normalizeArtifacts(body["artifacts"]) : null;
        if (normalizedArtifacts && "error" in normalizedArtifacts) return json({ error: normalizedArtifacts.error }, 400);

        let localDraft: ObjectiveDelivery | null = null;
        if (has("draft")) {
          try {
            localDraft = parseDelivery(body["draft"]);
            if (localDraft.kind === "not_produced") return json({ error: "draft_not_produced" }, 422);
          } catch {
            return json({ error: "invalid_local_draft" }, 400);
          }
        }

        const revision = body["runtime_revision"];
        const terminal = status === "verified" || status === "rejected" || status === "failed";

        // Only fields the runtime actually sent are written. A progressive
        // report (stage → stage → verified) must never blank out values an
        // earlier report already published.
        const patch: QueuePatch = { status };
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
        // Keep valid local ASCENSION drafts regardless of web hosting provider.
        // The transport remains separately labelled; it never becomes core verification.
        if (localDraft) {
          const { data: target, error: targetError } = await supabaseAdmin
            .from("ascension_execution_requests")
            .select("objective")
            .eq("id", id)
            .eq("engine", "governed_runtime")
            .maybeSingle();
          if (targetError) return json({ error: "draft_target_read_failed" }, 500);
          if (!target) return json({ error: "unknown_request_id" }, 404);
          if (!assessResult(target.objective, localDraft.body, localDraft.files).produced)
            return json({ error: "local_draft_did_not_produce_requested_result" }, 422);
          localDraft = {
            ...localDraft,
            limitations: [
              ...localDraft.limitations.slice(0, 8),
              "Local model draft. ASCENSION governed verification and persistence are separate.",
            ],
          };
        }

        const { data, error } = await supabaseAdmin
          .from("ascension_execution_requests")
          .update(patch)
          .eq("id", id)
          .eq("engine", "governed_runtime")
          .select("id, status, stage, completed_at")
          .maybeSingle();
        if (error) return json({ error: "update_failed" }, 500);
        if (!data) return json({ error: "unknown_request_id" }, 404);

        if (localDraft) {
          const now = new Date().toISOString();
          const { error: draftError } = await supabaseAdmin.from("ascension_run_stages").upsert(
            {
              request_id: id,
              ordinal: 102,
              stage: "external_result",
              engine_label: "LOCAL_MODEL_DRAFT",
              engine_model: optionalString(body["draft_model"], 120) ?? "local-model",
              status: "completed",
              request_payload: { source_key: `local:${id}` } as Json,
              response_payload: localDraft as unknown as Json,
              response_text: localDraft.body,
              duration_ms: 0,
              error: null,
              completed_at: now,
            },
            { onConflict: "request_id,ordinal" },
          );
          if (draftError) return json({ error: "local_draft_transport_failed" }, 500);
        }

        if (normalizedArtifacts && "files" in normalizedArtifacts) {
          const now = new Date().toISOString();
          const { error: artifactError } = await supabaseAdmin.from("ascension_run_stages").upsert(
            {
              request_id: id,
              ordinal: ARTIFACT_ORDINAL,
              stage: "runtime_artifacts",
              engine_label: ARTIFACT_LABEL,
              engine_model: "governed-runtime",
              status: "completed",
              response_payload: { files: normalizedArtifacts.files } as unknown as Json,
              response_text: null,
              duration_ms: 0,
              error: null,
              completed_at: now,
            },
            { onConflict: "request_id,ordinal" },
          );
          if (artifactError) return json({ error: "artifact_transport_failed" }, 500);
        }

        return json({ ok: true, request: data, artifacts: normalizedArtifacts && "files" in normalizedArtifacts ? normalizedArtifacts.files.length : 0 }, 200);
      },
    },
  },
});
