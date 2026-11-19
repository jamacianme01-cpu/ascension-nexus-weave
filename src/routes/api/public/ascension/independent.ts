import { createFileRoute } from "@tanstack/react-router";
import { retrieveKnowledge } from "@/lib/ascension/engine/knowledge.server";

/** Published Knowledgeverse lookup only. Governed objectives use the secured queue. */
const counters = new Map<string, { window: number; count: number }>();

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
function limit(key: string, max: number): boolean {
  const now = Date.now();
  const old = counters.get(key);
  const next = !old || now - old.window > 3600000 ? { window: now, count: 1 } : { window: old.window, count: old.count + 1 };
  counters.set(key, next);
  if (counters.size > 1000) for (const [k, v] of counters) if (now - v.window > 3600000) counters.delete(k);
  return next.count <= max;
}
function obj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
/**
 * Provider-free read of ASCENSION's existing published Meaning Elements,
 * Knowledgeverse and governed evidence records. No new outcome is fabricated.
 */
async function internalFirstAnswer(objective: string) {
  const result = await retrieveKnowledge(objective, 5);
  const lines = result.evidence.map((item, index) =>
    String(index + 1) + ". " + item.record_kind + " [" + item.source_path + "]: " + item.snippet.slice(0, 750));
  return {
    phase: "initial" as const,
    answer: lines.length
      ? "Related records from ASCENSION's existing Knowledgeverse (not a new engine run):\\n\\n" +
          lines.join("\\n\\n") +
          "\\n\\nThe governed runtime must process this objective before new verified pathways can be presented."
      : "No matching Knowledgeverse records are published for this objective. The governed runtime must process it before new pathways can be presented.",
    contributor: "ASCENSION_KNOWLEDGE_RETRIEVAL",
    source_revision: result.source_revision,
    verified: false,
    governed_runtime_invoked: false,
  };
}

export const Route = createFileRoute("/api/public/ascension/independent")({
  server: { handlers: {
    GET: async () => json({
      answer_contract_version: "ascension-governed-only-20261119",
      internal_knowledge_read_enabled: true,
      note: "Knowledgeverse retrieval is separate from verified governed execution. Submit objectives through the secured ASCENSION execution queue.",
    }),
    POST: async ({ request }) => {
      const origin = request.headers.get("origin");
      const fetchSite = request.headers.get("sec-fetch-site");
      const publicHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host).split(",")[0]!.trim().split(":")[0];
      if (fetchSite === "cross-site" || (origin && new URL(origin).hostname !== publicHost))
        return json({ error: "Cross-site requests are not permitted." }, 403);
      const address = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0]?.trim() || "unknown";
      if (!limit("global", 48) || !limit("ip:" + address, 12)) return json({ error: "Too many objectives. Try again later." }, 429);
      try {
        const raw = await request.text();
        if (raw.length > 15000) return json({ error: "Objective too long." }, 413);
        const input = obj(JSON.parse(raw));
        const objective = String(input["objective"] ?? "").trim();
        const category = String(input["category"] ?? "");
        if (!["Business Planner", "Build / Create", "Guidance"].includes(category))
          return json({ error: "Choose a Book category first." }, 400);
        if (objective.length < 3 || objective.length > 4000)
          return json({ error: "Spoken objective must contain 3 to 4000 characters." }, 400);
        if (input["phase"] === "knowledge" || input["phase"] === "initial")
          return json(await internalFirstAnswer(objective));
        return json({
          error: "New pathway generation runs through ASCENSION's secured governed execution queue, not this knowledge lookup.",
        }, 405);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Knowledge retrieval failed.";
        console.error("[ASCENSION knowledge] " + message.slice(0, 600));
        return json({ error: message.slice(0, 400) }, 503);
      }
    },
  } },
});
