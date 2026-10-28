import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } },
});
try {
  const { normalizeQueueClaim, normalizeQueueContext } =
    await server.ssrLoadModule("/src/lib/ascension/queue-claim.ts");
  assert.deepEqual(normalizeQueueClaim({ id: "queued-1", evidence: null, constraints: null }),
                   { id: "queued-1", evidence: [], constraints: [] });
  assert.deepEqual(normalizeQueueClaim({ id: "queued-2", evidence: ["user supplied"], constraints: [] }),
                   { id: "queued-2", evidence: ["user supplied"], constraints: [] });
  const source = [" GRANTED_PERMISSIONS: read ", "first-party evidence"];
  const claim = normalizeQueueClaim({ evidence: source, constraints: null });
  assert.equal(claim.evidence, source, "Never rewrite user evidence");
  assert.throws(() => normalizeQueueContext({ bad: "value" }, "evidence"), /expected array/);
  assert.throws(() => normalizeQueueContext(["ok", 1], "constraints"), /expected array/);
  assert.throws(() => normalizeQueueContext("unverified evidence", "evidence"), /expected array/);
  console.log("PASS governed queue claim normalizes SQL NULL without altering submitted evidence");
} finally {
  await server.close();
}
