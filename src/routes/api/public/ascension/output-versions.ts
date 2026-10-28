import { createFileRoute } from "@tanstack/react-router";
import { authorizeAscensionHub } from "@/lib/ascension/hub-auth.server";
import { normalizeOutputVersions } from "@/lib/ascension/output-versions.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
const uuid = (s: string | null) =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function planning(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const p = (value as Record<string, unknown>)["objective_planning"];
  if (!p || typeof p !== "object" || Array.isArray(p)) return [];
  const branches = (p as Record<string, unknown>)["branches"];
  return Array.isArray(branches)
    ? branches.flatMap((branch) => {
        if (!branch || typeof branch !== "object" || Array.isArray(branch)) return [];
        const b = branch as Record<string, unknown>;
        if (typeof b["branch_id"] !== "string") return [];
        return [{
          id: b["branch_id"],
          approach: String(b["approach"] ?? "").slice(0, 180),
          actions: Array.isArray(b["actions"]) ? b["actions"].filter((a) => typeof a === "string").slice(0, 12) : [],
          risks: Array.isArray(b["risks"]) ? b["risks"].filter((a) => typeof a === "string").slice(0, 8) : [],
          capability: String(b["capability"] ?? "").slice(0, 120),
        }];
      }).slice(0, 3)
    : [];
}

async function target(id: string) {
  const { data, error } = await supabaseAdmin
    .from("ascension_execution_requests")
    .select("id, objective, engine, status, result")
    .eq("id", id)
    .eq("engine", "governed_runtime")
    .maybeSingle();
  if (error) throw new Error("output_versions_target_read_failed");
  return data;
}

/** Hub-key authenticated; version files are supplemental, NOT governed proof. */
export const Route = createFileRoute("/api/public/ascension/output-versions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await authorizeAscensionHub(request);
        if (denied) return denied;
        const id = new URL(request.url).searchParams.get("request_id");
        if (!uuid(id)) return json({ error: "invalid_request_id" }, 400);
        const row = await target(id!);
        if (!row) return json({ error: "unknown_request_id" }, 404);
        if (row.status !== "verified") return json({ error: "governed_runtime_not_verified" }, 409);
        const branches = planning(row.result);
        if (branches.length !== 3 || new Set(branches.map((b) => b.id)).size !== 3)
          return json({ error: "three_distinct_governed_branches_required" }, 422);
        // Hub-key access only: recover existing generated source files so a
        // retry does not waste compute or overwrite three successful versions.
        const { data: versionStage, error: versionError } = await supabaseAdmin
          .from("ascension_run_stages")
          .select("status,response_payload")
          .eq("request_id", id!)
          .eq("ordinal", 103)
          .maybeSingle();
        if (versionError) return json({ error: "version_recovery_unavailable" }, 503);
        const existing = versionStage?.status === "completed" ? versionStage.response_payload : null;
        return json({ request_id: id, objective: row.objective, branches,
          existing_versions: existing && typeof existing === "object" && !Array.isArray(existing)
            ? (existing as Record<string, unknown>)["versions"] ?? null : null });
      },
      POST: async ({ request }) => {
        const denied = await authorizeAscensionHub(request);
        if (denied) return denied;
        let body: Record<string, unknown>;
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return json({ error: "invalid_json" }, 400); }
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            !uuid(typeof body["request_id"] === "string" ? body["request_id"] : null))
          return json({ error: "invalid_request_id" }, 400);
        const id = body["request_id"] as string;
        const row = await target(id);
        if (!row) return json({ error: "unknown_request_id" }, 404);
        if (row.status !== "verified") return json({ error: "governed_runtime_not_verified" }, 409);
        const branches = planning(row.result);
        if (branches.length !== 3) return json({ error: "three_governed_branches_required" }, 422);
        let normalized;
        try { normalized = normalizeOutputVersions(body, branches.map((b) => b.id)); }
        catch (e) { return json({ error: "invalid_output_versions", reason: e instanceof Error ? e.message : String(e) }, 422); }
        // Fail closed: a recovery may fill unavailable slots, but must never
        // silently erase or replace a previously saved created version.
        const { data: existingStage, error: existingError } = await supabaseAdmin
          .from("ascension_run_stages")
          .select("status,response_payload")
          .eq("request_id", id)
          .eq("ordinal", 103)
          .maybeSingle();
        if (existingError) return json({ error: "version_recovery_unavailable" }, 503);
        if (existingStage?.status === "completed" && existingStage.response_payload) {
          try {
            const prior = normalizeOutputVersions(existingStage.response_payload, branches.map((b) => b.id));
            for (let index = 0; index < prior.versions.length; index++) {
              const oldVersion = prior.versions[index]!;
              const newVersion = normalized.versions[index]!;
              if (oldVersion.status !== "created") continue;
              if (newVersion.status !== "created" ||
                  oldVersion.id !== newVersion.id ||
                  JSON.stringify(oldVersion.files.map((f) => [f.name, f.sha256, f.bytes])) !==
                  JSON.stringify(newVersion.files.map((f) => [f.name, f.sha256, f.bytes])))
                return json({ error: "existing_created_version_must_be_preserved" }, 409);
            }
          } catch {
            return json({ error: "invalid_stored_output_versions" }, 409);
          }
        }
        const now = new Date().toISOString();
        const { error } = await supabaseAdmin.from("ascension_run_stages").upsert({
          request_id: id,
          ordinal: 103,
          stage: "output_versions",
          engine_label: "LOCAL_CAPABILITY_VERSIONS_UNVERIFIED",
          engine_model: "local-execution-adapter",
          status: "completed",
          response_payload: normalized as unknown as Json,
          response_text: null,
          duration_ms: 0,
          error: null,
          completed_at: now,
        }, { onConflict: "request_id,ordinal" });
        if (error) return json({ error: "output_versions_persist_failed" }, 500);
        return json({
          ok: true,
          produced_versions: normalized.versions.filter((v) => v.status === "created").length,
          required_versions: 4,
        });
      },
    },
  },
});
