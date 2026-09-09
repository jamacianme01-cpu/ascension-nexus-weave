import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Secured intake for the operator's Observation Gateway relay.
 *
 * The operator's runtime pushes each documented GET response here VERBATIM
 * (exact response text), so the published site can serve the real governed
 * state to the internet without exposing the local machine. Nothing here
 * reaches into the governed core, and no value is parsed, normalised or
 * synthesised — the bytes are stored and later replayed unchanged.
 */

interface RelayBody {
  revision?: unknown;
  source_classification?: unknown;
  documents?: unknown;
  replace?: unknown;
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
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

export const Route = createFileRoute("/api/public/ascension/relay")({
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

        let body: RelayBody;
        try {
          body = (await request.json()) as RelayBody;
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const documents = body.documents;
        if (!documents || typeof documents !== "object" || Array.isArray(documents)) {
          return json({ error: "documents must be an object of path → exact response text" }, 400);
        }
        const entries = Object.entries(documents as Record<string, unknown>);
        if (!entries.length) return json({ error: "documents is empty" }, 400);
        if (entries.length > 64) return json({ error: "too many documents" }, 400);

        const revision =
          typeof body.revision === "number" && Number.isInteger(body.revision) ? body.revision : null;
        const classification =
          typeof body.source_classification === "string" && body.source_classification.trim()
            ? body.source_classification
            : null;

        const rows: {
          path: string;
          body: string;
          revision: number | null;
          source_classification: string | null;
          http_status: number;
          received_at: string;
        }[] = [];

        for (const [rawPath, value] of entries) {
          if (typeof rawPath !== "string" || !rawPath.startsWith("/")) {
            return json({ error: `document path must start with "/": ${rawPath}` }, 400);
          }
          let text: string;
          let status = 200;
          if (typeof value === "string") {
            text = value;
          } else if (value && typeof value === "object" && !Array.isArray(value)) {
            const record = value as Record<string, unknown>;
            if (typeof record["text"] !== "string") {
              return json({ error: `document ${rawPath} needs a "text" string` }, 400);
            }
            text = record["text"];
            if (typeof record["status"] === "number") status = record["status"];
          } else {
            return json({ error: `document ${rawPath} must be the exact response text` }, 400);
          }
          if (text.length > 4_000_000) return json({ error: `document ${rawPath} too large` }, 400);
          rows.push({
            path: rawPath.replace(/\/+$/, "") || "/",
            body: text,
            revision,
            source_classification: classification,
            http_status: status,
            received_at: new Date().toISOString(),
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Whole-set replacement keeps relayed surfaces coherent: a stale surface
        // from an earlier revision is never served alongside a newer one.
        if (body.replace !== false) {
          const keep = rows.map((row) => row.path);
          const { error: pruneError } = await supabaseAdmin
            .from("ascension_relay_documents")
            .delete()
            .not("path", "in", `(${keep.map((path) => `"${path}"`).join(",")})`);
          if (pruneError) {
            console.error("ascension relay prune failed", pruneError.message);
            return json({ error: "store_failed" }, 500);
          }
        }

        const { error } = await supabaseAdmin
          .from("ascension_relay_documents")
          .upsert(rows, { onConflict: "path" });
        if (error) {
          console.error("ascension relay store failed", error.message);
          return json({ error: "store_failed" }, 500);
        }

        return json({ ok: true, revision, paths: rows.map((row) => row.path) }, 200);
      },
    },
  },
});
