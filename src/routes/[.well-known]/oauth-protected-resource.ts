import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      ANY: async () =>
        new Response(
          JSON.stringify({ error: "OAuth protected resource is not enabled." }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
    },
  },
});
