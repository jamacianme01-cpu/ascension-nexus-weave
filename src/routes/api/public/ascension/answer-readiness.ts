import { createFileRoute } from "@tanstack/react-router";
import { databaseConnectivity } from "@/lib/ascension/data/postgres.server";
import { ownerVolumeTransportEnabled, callOwnerVolumeTransport } from "@/lib/ascension/data/volume-transport.server";

/** Read-only ASCENSION status. Never infer governed execution from stored credentials. */
export const Route = createFileRoute("/api/public/ascension/answer-readiness")({
  server: {
    handlers: {
      GET: async () => {
        const database = await databaseConnectivity();
        let ownerQueueConnected = false;
        let ownerPublicationRevision: number | null = null;
        if (ownerVolumeTransportEnabled()) {
          try {
            const snapshot = await callOwnerVolumeTransport<{
              status: string;
              original_publication_revision_at_start: number;
            }>("/health", "GET");
            ownerQueueConnected = snapshot.status === "LIVE_GOVERNED_TRANSPORT";
            if (ownerQueueConnected) ownerPublicationRevision = snapshot.original_publication_revision_at_start;
          } catch { /* A missing worker stays unavailable, never reported as healthy. */ }
        }
        return new Response(JSON.stringify({
          cloud_answer_configured: false,
          cloud_provider: null,
          pc_independent_answers_configured: false,
          governed_runtime_connected: false,
          database_connected: database.connected,
          database_status: ownerVolumeTransportEnabled() ? "OWNER_VOLUME_TRANSPORT_SELECTED" : database.reason,
          owner_queue_transport_connected: ownerQueueConnected,
          owner_publication_revision_at_worker_start: ownerPublicationRevision,
          live_inference_tested: false,
          note: ownerQueueConnected
            ? "Original ASCENSION worker queue transport is reachable; a real objective is required to prove end-to-end governed execution."
            : "ASCENSION's authored governed worker must complete a real objective before engine connectivity can be confirmed.",
        }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
