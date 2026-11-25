import { createFileRoute } from "@tanstack/react-router";
import { databaseConnectivity } from "@/lib/ascension/data/postgres.server";
import { ownerVolumeTransportEnabled, callOwnerVolumeTransport } from "@/lib/ascension/data/volume-transport.server";

/** Read-only ASCENSION status. Never infer governed execution from stored credentials. */
export const Route = createFileRoute("/api/public/ascension/answer-readiness")({
  server: {
    handlers: {
      GET: async () => {
        const ownerTransportSelected = ownerVolumeTransportEnabled();
        // The owner queue is authoritative in this mode. Never contact a legacy
        // database merely to report whether the selected local transport is ready.
        const database = ownerTransportSelected
          ? { connected: false, reason: "OWNER_VOLUME_TRANSPORT_SELECTED" }
          : await databaseConnectivity();
        let ownerQueueConnected = false;
        let ownerWorkerPolling = false;
        let ownerPublicationRevision: number | null = null;
        if (ownerTransportSelected) {
          try {
            const snapshot = await callOwnerVolumeTransport<{
              status: string;
              original_publication_revision_at_start: number;
              worker_recently_polling?: boolean;
            }>("/health", "GET");
            ownerQueueConnected = snapshot.status === "LIVE_GOVERNED_TRANSPORT";
            if (ownerQueueConnected) {
              ownerPublicationRevision = snapshot.original_publication_revision_at_start;
              ownerWorkerPolling = snapshot.worker_recently_polling === true;
            }
          } catch { /* A missing worker stays unavailable, never reported as healthy. */ }
        }
        return new Response(JSON.stringify({
          cloud_answer_configured: false,
          cloud_provider: null,
          pc_independent_answers_configured: false,
          governed_runtime_connected: false,
          database_connected: database.connected,
          database_status: database.reason,
          owner_queue_transport_connected: ownerQueueConnected,
          owner_worker_recently_polling: ownerWorkerPolling,
          owner_publication_revision_at_worker_start: ownerPublicationRevision,
          live_inference_tested: false,
          note: ownerQueueConnected
            ? ownerWorkerPolling
              ? "The authenticated owner worker recently polled the queue; a completed objective is still required to prove governed execution."
              : "The local queue transport is reachable, but no recent original worker poll is confirmed."
            : "ASCENSION's authored governed worker must complete a real objective before engine connectivity can be confirmed.",
        }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
