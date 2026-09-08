import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Publication intake for the operator's Observation Gateway.
 *
 * The gateway PUSHES each verified publication here; nothing in this app ever
 * reaches into the governed core. Requests must carry the shared publish token.
 * Payloads are stored verbatim — no field is normalised, defaulted or inferred.
 */

interface PublishBody {
  revision?: unknown;
  source_classification?: unknown;
  snapshot_hash?: unknown;
  content_hash?: unknown;
  published_at?: unknown;
  surfaces?: unknown;
}

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

export const Route = createFileRoute("/api/public/ascension/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["ASCENSION_PUBLISH_TOKEN"];
        if (!expected) return json({ error: "publish_token_not_configured" }, 503);

        const header =
          request.headers.get("x-ascension-publish-token") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          null;
        if (!tokenMatches(header, expected)) return json({ error: "unauthorized" }, 401);

        let body: PublishBody;
        try {
          body = (await request.json()) as PublishBody;
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const revision = body.revision;
        if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
          return json({ error: "revision must be a non-negative integer" }, 400);
        }
        const classification = body.source_classification;
        if (typeof classification !== "string" || !classification.trim()) {
          return json({ error: "source_classification is required" }, 400);
        }
        const surfaces = body.surfaces;
        if (!surfaces || typeof surfaces !== "object" || Array.isArray(surfaces)) {
          return json({ error: "surfaces must be an object of surface name → payload" }, 400);
        }
        const entries = Object.entries(surfaces as Record<string, unknown>);
        if (entries.length === 0) return json({ error: "surfaces is empty" }, 400);
        if (entries.length > 64) return json({ error: "too many surfaces" }, 400);

        const optionalString = (value: unknown) => (typeof value === "string" ? value : null);

        const rows = entries.map(([surface, payload]) => ({
          revision,
          surface,
          source_classification: classification,
          snapshot_hash: optionalString(body.snapshot_hash),
          content_hash: optionalString(body.content_hash),
          published_at: optionalString(body.published_at),
          payload: payload ?? null,
        }));

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("ascension_publications")
          .upsert(rows, { onConflict: "revision,surface" });
        if (error) {
          console.error("ascension publish failed", error.message);
          return json({ error: "store_failed" }, 500);
        }

        return json({ ok: true, revision, surfaces: rows.map((row) => row.surface) }, 200);
      },
    },
  },
});
