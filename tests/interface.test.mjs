import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { resolve } from "node:path";

const server = await createServer({ configFile: false, server: { middlewareMode: true }, resolve: { alias: { "@": resolve("src") } } });
let passed = 0;
function check(name, fn) { fn(); passed++; process.stdout.write(`PASS ${name}\n`); }
try {
  const model = await server.ssrLoadModule("/src/lib/ascension/result-model.ts");
  const { knowledgeWorld } = await server.ssrLoadModule("/src/lib/ascension/world-model.ts");
  const { callZai } = await server.ssrLoadModule("/src/lib/ascension/engine/zai.server.ts");
  const run = JSON.parse(await readFile("tests/fixtures/objective-run.json", "utf8"));
  const live = JSON.parse(await readFile("tests/fixtures/world-publication.json", "utf8"));
  const base = { entities: {}, worldModel: {}, chamber: {}, live };
  const world = knowledgeWorld(base);
  check("published forms survive even without relationships", () => {
    assert.equal(world.nodes.length, 3);
    assert.equal(world.edges.length, 1);
    assert.ok(world.nodes.find(n => n.name === "objective runtime"));
  });
  check("identity, chromosomes and lineage come from the real contract", () => {
    const n = world.nodes.find(n => n.name === "objective runtime");
    assert.equal(n.persistentId, "PERSIST:objective_runtime:cdc4383b");
    assert.equal(n.sid, "SID:objective_runtime:1:001");
    assert.equal(n.delta.K, 2); assert.equal(n.events.length, 2);
    assert.ok(n.chromosome.identity_elements.includes("objectives"));
  });
  check("emergence is mapped as recorded, not invented", () => { assert.equal(world.emergences.length, 1); assert.equal(world.emergences[0].status, "OBSERVED"); });
  check("empty publication remains empty", () => { assert.equal(knowledgeWorld({ ...base, live: { forms: [] } }).nodes.length, 0); });
  check("demo state remains explicitly separate", () => { const w = knowledgeWorld({ entities: {}, chamber: {}, worldModel: {} }); assert.equal(w.source, "demo"); assert.equal(w.revision, null); });
  check("actual branch_id and approach map to selected future", () => { const p = model.planningFor(run.result); assert.ok(p.branches.some(b => b.branch_id === p.selected.branch_id)); assert.equal(model.branchTitle(p.selected), "Build and check in stages"); });
  check("governed persistence requires the core receipt", () => { assert.equal(model.governedPersisted(run), true); assert.equal(model.governedPersisted({ ...run, result: {} }), false); });
  check("external verified status never becomes ASCENSION verification", () => { assert.equal(model.governedPersisted({ ...run, engine: "zai" }), false); });
  check("missing persisted delta fails closed", () => { const x = structuredClone(run); delete x.result.publication.delta_in_persisted_ledger; assert.equal(model.governedPersisted(x), false); });
  const valid = { kind: "artifact", title: "Archive guide", body: "Created guide for review.", files: [{ name: "guide.md", content: "# Guide\nComplete draft." }], limitations: ["Draft requires review."] };
  check("complete answer and file content is retained", () => assert.deepEqual(model.parseDelivery(valid), valid));
  check("path traversal and duplicate file names are refused", () => { assert.throws(() => model.parseDelivery({ ...valid, files: [{ name: "../secret", content: "x" }] })); assert.throws(() => model.parseDelivery({ ...valid, files: [...valid.files, ...valid.files] })); });
  check("empty or partial generated output is refused", () => { assert.throws(() => model.parseDelivery({ ...valid, body: "" })); assert.throws(() => model.parseDelivery({ ...valid, files: [] })); });
  check("canned Knowledgeverse template is refused", () => { assert.throws(() => model.parseDelivery({ kind: "answer", title: "Solution", body: "The Knowledgeverse has mapped 6 relevant entities. **Identity Phase:** Establish your objective\'s unique chromosome. **Development Phase:** Cultivate relationships. **Emergence Phase:** Allow verified deltas to guide natural evolution.", files: [], limitations: [] }), /generic architecture template/); });
  const original = globalThis.fetch;
  const priorKey = process.env.ZAI_API_KEY;
  process.env.ZAI_API_KEY = "test-only";
  try {
    const payload = JSON.stringify(valid);
    const bytes = new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta: { content: payload } }] }));
    globalThis.fetch = async (_url, init) => { assert.ok(init.signal instanceof AbortSignal); return new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 19)); c.enqueue(bytes.slice(19)); c.close(); } })); };
    const response = await callZai({ system: "test", user: "test" });
    check("stream chunks and final frame without newline are preserved", () => assert.deepEqual(response.json, valid));
    globalThis.fetch = async () => new Response('data: {"error":{"message":"engine failed"}}\n');
    await assert.rejects(() => callZai({ system: "test", user: "test" }), /engine failed/); passed++; process.stdout.write("PASS upstream stream errors reach the user\n");
  } finally { globalThis.fetch = original; if (priorKey === undefined) delete process.env.ZAI_API_KEY; else process.env.ZAI_API_KEY = priorKey; }
  process.stdout.write(`${passed} interface contract checks passed\n`);
} finally { await server.close(); }
