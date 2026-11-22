import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}


/**
 * Owner-approved autonomous intent growth. The process only runs against
 * mounted persistent ASCENSION storage and the original governed runtime.
 * No hosting/provider activation is performed here.
 */
let crystalEvolutionLoop: ReturnType<typeof setInterval> | null = null;
function startCrystalEvolutionLoop() {
  if (crystalEvolutionLoop || process.env["ASCENSION_ENABLE_CRYSTAL_EVOLUTION"] === "false") return;
  // Owner-approved crystal growth activates only on a configured durable host.
  // Never start a replacement runtime, provider, or deployment.
  const hasStorage = Boolean(process.env["ASCENSION_STORAGE_DIR"]?.trim());
  const hasRuntime = Boolean(
    (process.env["ASCENSION_VOLUME_TRANSPORT_URL"]?.trim() && process.env["ASCENSION_PUBLISH_TOKEN"]?.trim()) ||
    process.env["ASCENSION_DATABASE_URL"]?.trim() || process.env["DATABASE_URL"]?.trim()
  );
  if (!hasStorage || !hasRuntime) return;
  const run = async () => {
    try {
      const { advanceIntentCrystalsOnce } = await import("./lib/ascension/intent-evolution.server");
      const report = await advanceIntentCrystalsOnce();
      if (report.queued || report.failures) {
        console.info("ASCENSION intent evolution cycle", {
          scanned: report.scanned, queued: report.queued, failures: report.failures,
        });
      }
    } catch (cause) {
      console.error("ASCENSION intent evolution cycle failed", cause instanceof Error ? cause.message : String(cause));
    }
  };
  crystalEvolutionLoop = setInterval(() => { void run(); }, 30 * 60 * 1000);
  crystalEvolutionLoop.unref?.();
  const initial = setTimeout(() => { void run(); }, 30000);
  initial.unref?.();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    startCrystalEvolutionLoop();
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
