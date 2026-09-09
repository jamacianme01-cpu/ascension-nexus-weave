import { createFileRoute } from "@tanstack/react-router";

/**
 * Internet-reachable relay of the operator's Observation Gateway.
 *
 * GET-only. Each document is returned byte-for-byte as the governed gateway
 * produced it, so snapshot hash verification in the browser still holds. This
 * route never computes, normalises, defaults or infers an observation value —
 * it only replays what the secured push endpoint stored.
 */

const CONTRACT = "ascension.observation.v1";

function unavailable(path: string) {
  return new Response(
    JSON.stringify({
      schema_version: CONTRACT,
      generated_at: new Date().toISOString(),
      availability: "unavailable",
      error: `No relayed document for ${path}. The ASCENSION runtime has not pushed this surface.`,
      content: null,
      snapshot_hash: null,
    }),
    {
      status: 503,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    },
  );
}

export const Route = createFileRoute("/api/public/ascension/v1/$")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        }),
      GET: async ({ params }) => {
        const splat = (params as Record<string, string | undefined>)["_splat"] ?? "";
        const path = `/${splat}`.replace(/\/+$/, "") || "/";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("ascension_relay_documents")
          .select("body, http_status")
          .eq("path", path)
          .maybeSingle();

        if (error) {
          console.error("ascension relay read failed", error.message);
          return unavailable(path);
        }
        if (!data) return unavailable(path);

        return new Response(data.body as string, {
          status: (data.http_status as number) || 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
