import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => new Response(JSON.stringify({
        status: "ok",
        service: "ascension-web",
        scope: "web_server_only",
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }),
    },
  },
});
