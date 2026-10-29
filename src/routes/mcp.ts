import { createFileRoute } from "@tanstack/react-router";

/** ASCENSION MCP surface — independent stub. No third-party editor SDK. */
export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: async () =>
        new Response(
          JSON.stringify({
            error: "ASCENSION MCP surface is not enabled on this deployment.",
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
    },
  },
});
