import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateBrain, nextBrainJob, returnBrainReply, remoteBrainEnabled,
} from "@/lib/ascension/brain-relay.server";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: {
    "content-type": "application/json", "cache-control": "no-store",
  } });
}

/** The old computer polls OUTBOUND over HTTPS. No LAN ports are opened to the Internet. */
export const Route = createFileRoute("/api/public/ascension/brain-worker")({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!remoteBrainEnabled()) return json({ error: "brain_bridge_disabled" }, 503);
      if (!authenticateBrain(request)) return json({ error: "brain_not_authorized" }, 401);
      return json({ job: nextBrainJob() });
    },
    POST: async ({ request }) => {
      if (!remoteBrainEnabled()) return json({ error: "brain_bridge_disabled" }, 503);
      if (!authenticateBrain(request)) return json({ error: "brain_not_authorized" }, 401);
      let raw: string;
      try { raw = await request.text(); }
      catch { return json({ error: "unreadable_reply" }, 400); }
      if (raw.length > 13_000_000) return json({ error: "reply_too_large" }, 413);
      let input: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error();
        input = parsed as Record<string, unknown>;
      } catch { return json({ error: "invalid_json" }, 400); }
      const id = typeof input["id"] === "string" ? input["id"] : "";
      const status = input["status"];
      if (!/^[a-f0-9-]{36}$/.test(id) || typeof status !== "number" ||
          !Number.isInteger(status) || status < 200 || status > 599 ||
          !Object.hasOwn(input, "body")) return json({ error: "invalid_brain_reply" }, 400);
      return returnBrainReply(id, status, input["body"])
        ? json({ ok: true })
        : json({ error: "job_expired_or_unclaimed" }, 409);
    },
  } },
});
