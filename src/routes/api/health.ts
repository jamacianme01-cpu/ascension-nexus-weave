import { createFileRoute } from "@tanstack/react-router";
import { databaseConnectivity } from "@/lib/ascension/data/postgres.server";
import { ownerVolumeTransportEnabled, callOwnerVolumeTransport } from "@/lib/ascension/data/volume-transport.server";

/**
 * Report the actual selected persistence transport. Fly's original owner state
 * lives on the worker volume; a missing legacy SQL URL must not falsely report
 * its working private queue as a database failure.
 *
 * Queue reachability is not proof that an objective finished successfully.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        if (ownerVolumeTransportEnabled()) {
          let connected = false;
          let publicationRevision: number | null = null;
          try {
            const health = await callOwnerVolumeTransport<{
              status: string;
              original_publication_revision_at_start: number;
            }>("/health", "GET");
            connected = health.status === "LIVE_GOVERNED_TRANSPORT"
              && Number.isInteger(health.original_publication_revision_at_start)
              && health.original_publication_revision_at_start >= 1;
            if (connected) publicationRevision = health.original_publication_revision_at_start;
          } catch {
            // Fail closed if the existing Fly worker is unreachable.
          }
          return new Response(JSON.stringify({
            status: connected ? "ok" : "degraded",
            service: "ascension-web",
            scope: "web_and_existing_fly_owner_volume",
            owner_queue_transport_connected: connected,
            owner_publication_revision_at_worker_start: publicationRevision,
            live_inference_tested: false,
          }), {
            status: 200,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        }
        const database = await databaseConnectivity();
        return new Response(JSON.stringify({
          status: database.connected ? "ok" : "degraded",
          service: "ascension-web",
          scope: "web_and_existing_database",
          database,
        }), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
