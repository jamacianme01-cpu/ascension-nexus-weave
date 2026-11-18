import { createFileRoute } from "@tanstack/react-router";
import { databaseConnectivity } from "@/lib/ascension/data/postgres.server";

/**
 * Report actual database reachability. Web availability is not proof that
 * ASCENSION objective persistence and the governed queue are connected.
 * Do not expose database addresses, credentials, or state contents.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const database = await databaseConnectivity();
        return new Response(JSON.stringify({
          status: database.connected ? "ok" : "degraded",
          service: "ascension-web",
          scope: "web_and_existing_database",
          database,
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
