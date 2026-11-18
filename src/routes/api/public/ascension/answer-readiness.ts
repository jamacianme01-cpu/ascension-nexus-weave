import { createFileRoute } from "@tanstack/react-router";
import { databaseConnectivity } from "@/lib/ascension/data/postgres.server";

/** Read-only ASCENSION status. Never infer governed execution from stored credentials. */
export const Route = createFileRoute("/api/public/ascension/answer-readiness")({
  server: {
    handlers: {
      GET: async () => {
        const database = await databaseConnectivity();
        return new Response(JSON.stringify({
          cloud_answer_configured: false,
          cloud_provider: null,
          pc_independent_answers_configured: false,
          governed_runtime_connected: false,
          database_connected: database.connected,
          database_status: database.reason,
          live_inference_tested: false,
          note: "ASCENSION's authored governed worker must complete a real objective before engine connectivity can be confirmed.",
        }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
