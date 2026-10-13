import { createFileRoute } from "@tanstack/react-router";

/** Public diagnostics only. No secret value, account detail, or inference call. */
export const Route = createFileRoute("/api/public/ascension/answer-readiness")({
  server: {
    handlers: {
      GET: async () => {
        const openrouter = Boolean(process.env["OPENROUTER_API_KEY"]?.trim());
        const zaiFree = Boolean(process.env["ZAI_API_KEY"]?.trim());
        const provider = openrouter ? "openrouter_free" : zaiFree ? "zai_glm_free" : null;
        return new Response(JSON.stringify({
          cloud_answer_configured: Boolean(provider),
          cloud_provider: provider,
          requires_owner_pc: false,
          live_inference_tested: false,
          note: provider
            ? "Cloud credentials detected. Submit a new objective to verify actual inference."
            : "Configure a hosted free-model API key to enable PC-independent answers.",
        }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
