import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

const BUCKET = "ascension-models";
const MODEL_MIME = "model/gltf-binary";
const MAX_MODEL_BYTES = 50 * 1024 * 1024;
const STATUSES = ["running", "completed", "failed"] as const;
type ReportStatus = (typeof STATUSES)[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorize(request: Request): Response | null {
  const expected = process.env["ASCENSION_PUBLISH_TOKEN"];
  if (!expected) return json({ error: "publish_token_not_configured" }, 503);
  const provided =
    request.headers.get("x-ascension-publish-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  return tokenMatches(provided, expected) ? null : json({ error: "unauthorized" }, 401);
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

async function ensureModelBucket() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (!data) {
    const created = await supabaseAdmin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_MODEL_BYTES,
      allowedMimeTypes: [MODEL_MIME, "application/octet-stream"],
    });
    if (created.error && !/already exists/i.test(created.error.message)) {
      throw new Error(created.error.message);
    }
  } else if (!data.public) {
    const updated = await supabaseAdmin.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_MODEL_BYTES,
      allowedMimeTypes: [MODEL_MIME, "application/octet-stream"],
    });
    if (updated.error) throw new Error(updated.error.message);
  }
  return supabaseAdmin;
}

export const Route = createFileRoute("/api/public/ascension/model-queue")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = authorize(request);
        if (denied) return denied;

        const runner =
          clean(new URL(request.url).searchParams.get("runner"), 200) ?? "hunyuan-windows";
        let supabaseAdmin;
        try {
          supabaseAdmin = await ensureModelBucket();
        } catch {
          return json({ error: "model_storage_unavailable" }, 503);
        }

        const table = supabaseAdmin.from("ascension_model_jobs" as never) as any;

        // A worker can successfully claim a job and then lose connectivity before
        // reporting "running". Recover only stale "claimed" jobs; never recycle an
        // actively running generation.
        const staleClaimCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { error: recoveryError } = await table
          .update({
            status: "queued",
            claimed_at: null,
            claimed_by: null,
            updated_at: new Date().toISOString(),
            error: null,
          })
          .eq("status", "claimed")
          .lt("claimed_at", staleClaimCutoff);
        if (recoveryError) {
          return json({ error: "model_stale_claim_recovery_failed" }, 500);
        }

        const columns =
          "id, request_id, pathway_id, label, summary, visual_svg, source_image_url, created_at";
        // A saved user-selected reference is the exact artwork promised in the
        // viewer. Consume those jobs first instead of spending image credits on
        // older jobs whose source still needs generation.
        const { data: referenced, error: referenceReadError } = await table
          .select(columns)
          .eq("status", "queued")
          .not("source_image_url", "is", null)
          .order("created_at", { ascending: true })
          .limit(1);
        if (referenceReadError) return json({ error: "model_queue_read_failed" }, 500);
        let pending = referenced;
        if (!pending?.length) {
          // Never claim a source-less job merely to initiate a paid image request.
          // Hunyuan can still process jobs with a previously saved approved image.
          const { imageProvider } = await import("@/lib/ascension/engine/image.server");
          if (!imageProvider()) return json({ item: null, reason: "awaiting_saved_approved_source_image" });
          const fallback = await table
            .select(columns)
            .eq("status", "queued")
            .order("created_at", { ascending: true })
            .limit(1);
          if (fallback.error) return json({ error: "model_queue_read_failed" }, 500);
          pending = fallback.data;
        }

        const next = pending?.[0];
        if (!next) return json({ item: null });

        const now = new Date().toISOString();
        const { data: claimed, error: claimError } = await table
          .update({
            status: "claimed",
            claimed_at: now,
            claimed_by: runner,
            updated_at: now,
            error: null,
          })
          .eq("id", next.id)
          .eq("status", "queued")
          .select(
            "id, request_id, pathway_id, label, summary, visual_svg, source_image_url, created_at",
          )
          .maybeSingle();
        if (claimError) return json({ error: "model_claim_failed" }, 500);
        if (!claimed) return json({ item: null });

        // Generate the reference only after a worker claims this model job.
        // ENGAGE has already persisted and returned the answer by this point.
        if (!claimed.source_image_url) {
          try {
            const { data: run, error: runError } = await supabaseAdmin
              .from("ascension_execution_requests")
              .select("objective")
              .eq("id", claimed.request_id)
              .single();
            if (runError || !run) throw new Error(runError?.message ?? "Model objective missing.");
            const { generateConceptImage, conceptImagePrompt } =
              await import("@/lib/ascension/engine/image.server");
            const sourceUrl = await generateConceptImage(
              conceptImagePrompt(run.objective, claimed),
              `references/${claimed.request_id}/${claimed.id}.png`,
            );
            const { error: saveError } = await table
              .update({
                source_image_url: sourceUrl,
                updated_at: new Date().toISOString(),
              })
              .eq("id", claimed.id)
              .eq("status", "claimed");
            if (saveError) throw new Error(saveError.message);
            claimed.source_image_url = sourceUrl;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            const { error: failureError } = await table
              .update({
                status: "failed",
                error: `Reference image failed: ${message}`.slice(0, 4000),
                updated_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
              })
              .eq("id", claimed.id)
              .eq("status", "claimed");
            if (failureError) return json({ error: "model_reference_failure_update_failed" }, 500);
            return json({ item: null, error: `Reference image failed: ${message}` }, 502);
          }
        }

        const objectPath = claimed.request_id + "/" + claimed.id + ".glb";
        const signed = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUploadUrl(objectPath, { upsert: true });
        if (signed.error || !signed.data) {
          await table
            .update({
              status: "queued",
              claimed_at: null,
              claimed_by: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", claimed.id)
            .eq("status", "claimed");
          return json({ error: "model_upload_sign_failed" }, 500);
        }
        const publicData = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath).data;

        return json({
          item: {
            ...claimed,
            upload_path: objectPath,
            upload_url: signed.data.signedUrl,
            public_url: publicData.publicUrl,
          },
        });
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

        const jobId = clean(body["job_id"], 64);
        const status = body["status"];
        if (!jobId) return json({ error: "job_id is required" }, 400);
        if (typeof status !== "string" || !STATUSES.includes(status as ReportStatus)) {
          return json({ error: "invalid_status" }, 400);
        }

        let supabaseAdmin;
        try {
          supabaseAdmin = await ensureModelBucket();
        } catch {
          return json({ error: "model_storage_unavailable" }, 503);
        }
        const table = supabaseAdmin.from("ascension_model_jobs" as never) as any;
        const { data: job, error: readError } = await table
          .select("id, request_id, pathway_id, status")
          .eq("id", jobId)
          .maybeSingle();
        if (readError) return json({ error: "model_job_read_failed" }, 500);
        if (!job) return json({ error: "unknown_model_job" }, 404);

        const now = new Date().toISOString();
        if (status === "running") {
          const { error } = await table
            .update({ status: "running", updated_at: now, error: null })
            .eq("id", jobId)
            .in("status", ["claimed", "running"]);
          return error ? json({ error: "model_running_update_failed" }, 500) : json({ ok: true });
        }

        if (status === "failed") {
          const { error } = await table
            .update({
              status: "failed",
              error: clean(body["error"], 4000) ?? "Hunyuan3D generation failed.",
              updated_at: now,
              completed_at: now,
            })
            .eq("id", jobId);
          return error ? json({ error: "model_failed_update_failed" }, 500) : json({ ok: true });
        }

        const objectPath = job.request_id + "/" + job.id + ".glb";
        const folder = await supabaseAdmin.storage.from(BUCKET).list(job.request_id, {
          limit: 100,
          search: job.id + ".glb",
        });
        if (folder.error || !(folder.data ?? []).some((item) => item.name === job.id + ".glb")) {
          return json({ error: "model_upload_missing" }, 409);
        }
        const publicUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath)
          .data.publicUrl;
        const { error } = await table
          .update({
            status: "completed",
            model_url: publicUrl,
            error: null,
            updated_at: now,
            completed_at: now,
          })
          .eq("id", jobId);

        return error
          ? json({ error: "model_complete_update_failed" }, 500)
          : json({ ok: true, model_url: publicUrl });
      },
    },
  },
});
