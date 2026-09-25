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
  const access = await server.ssrLoadModule("/src/lib/ascension/source-access.ts");
  const codeWalker = await server.ssrLoadModule("/src/lib/ascension/code-walker.ts");
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
  check("general questions do not require a Library Card", () => {
    assert.equal(access.libraryCardAccess("general_question", false).allowed, true);
    assert.equal(access.libraryCardAccess("general_question", false).libraryCardRequired, false);
  });
  check("personalized pathway access requires a Library Card first", () => {
    assert.equal(access.libraryCardAccess("personalized_pathway", false).allowed, false);
    assert.equal(access.libraryCardAccess("personalized_pathway", true).allowed, true);
  });
  check("Code Walker refuses to treat missing permission as access", () => {
    const source = { id: "game-1", kind: "game_project", label: "Game", connected: true, grantedByUser: true, permissions: ["read"] };
    const plan = codeWalker.buildCodeWalkerPlan({ objective: "Add companion AI", desiredCapability: "adaptive companion", surface: { source, systemType: "game", technologies: ["Unreal"], entryPoints: ["project"], extensionPoints: ["plugin API"], runtimeSignals: ["logs"], protectedAreas: [] } });
    assert.equal(plan.canInspect, true);
    assert.equal(plan.canModify, false);
    assert.equal(plan.canExecute, false);
    assert.ok(plan.blockers.some(x => x.includes("Write/create/control")));
  });
  check("Code Walker recognizes fully authorized extension flow", () => {
    const source = { id: "game-2", kind: "game_project", label: "Game", connected: true, grantedByUser: true, permissions: ["read", "search", "write", "execute"] };
    const plan = codeWalker.buildCodeWalkerPlan({ objective: "Add companion AI", desiredCapability: "adaptive companion", surface: { source, systemType: "game", technologies: ["Unreal"], entryPoints: ["project"], extensionPoints: ["plugin API"], runtimeSignals: ["logs"], protectedAreas: [] } });
    assert.equal(plan.canInspect, true);
    assert.equal(plan.canModify, true);
    assert.equal(plan.canExecute, true);
    assert.equal(plan.steps.at(-1).stage, "verify");
  });
  const valid = { kind: "artifact", title: "Archive guide", body: "Created guide for review.", files: [{ name: "guide.md", content: "# Guide\nComplete draft." }], limitations: ["Draft requires review."] };
  check("complete answer and file content is retained", () => assert.deepEqual(model.parseDelivery(valid), valid));
  check("path traversal and duplicate file names are refused", () => { assert.throws(() => model.parseDelivery({ ...valid, files: [{ name: "../secret", content: "x" }] })); assert.throws(() => model.parseDelivery({ ...valid, files: [...valid.files, ...valid.files] })); });
  check("empty or partial generated output is refused", () => { assert.throws(() => model.parseDelivery({ ...valid, body: "" })); assert.throws(() => model.parseDelivery({ ...valid, files: [] })); });
  check("canned Knowledgeverse template is refused", () => { assert.throws(() => model.parseDelivery({ kind: "answer", title: "Solution", body: "The Knowledgeverse has mapped 6 relevant entities. **Identity Phase:** Establish your objective\'s unique chromosome. **Development Phase:** Cultivate relationships. **Emergence Phase:** Allow verified deltas to guide natural evolution.", files: [], limitations: [] }), /generic architecture template/); });
  const kf = "# Knowledge Form: stagedconstruct\n\n- draw\n- linear\n- propulsion\n- engine\n- staged_construct\n- tokens: draw, linear, propulsion";
  const moneyKf = "# Knowledge Form: stagedconstruct\n- make\n- quick\n- money\n- making\n- app";
  check("drawing objective: tokenized Knowledge Form is not a result", () => {
    const a = model.assessResult("draw a linear prpopulsion engine", kf, [{ name: "knowledge_form.md", content: kf }]);
    assert.equal(a.produced, false); assert.equal(a.kind, "drawing"); assert.equal(a.files.length, 0);
  });
  check("app objective: tokenized Knowledge Form is not a result", () => {
    const a = model.assessResult("make a quick money making app", moneyKf, [{ name: "form.md", content: moneyKf }]);
    assert.equal(a.produced, false); assert.equal(a.kind, "app"); assert.equal(a.files.length, 0);
  });
  check("plan, receipt and request echo are not results", () => {
    const echo = "make a quick money making app\n\nSelected future: Build and check in stages\n\nActions:\n- construct\n- verify\n\nVerification receipts: 1 artifact persisted";
    assert.equal(model.assessResult("make a quick money making app", echo, []).produced, false);
    assert.equal(model.assessResult("what is the capital of France", "what is the capital of France", []).produced, false);
  });
  check("verified status with only receipts stays not produced", () => {
    assert.throws(() => model.parseDelivery({ kind: "not_produced", title: "x", body: "not produced", files: [{ name: "a.md", content: "x" }], limitations: [] }));
    assert.equal(model.parseDelivery({ kind: "not_produced", title: "x", body: "The requested drawing has not been produced.", files: [], limitations: [] }).kind, "not_produced");
  });
  check("valid transported SVG drawing is displayed", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><rect x="10" y="20" width="180" height="20"/><line x1="0" y1="30" x2="200" y2="30"/></svg>';
    const a = model.assessResult("draw a linear propulsion engine", "", [{ name: "engine.svg", content: svg }, { name: "form.md", content: kf }]);
    assert.equal(a.produced, true); assert.deepEqual(a.files.map(f => f.name), ["engine.svg"]);
  });
  check("valid transported app code is displayed", () => {
    const html = "<!doctype html><html><body><h1>Tip Jar</h1><button id=b>Tip $1</button><script>let t=0;document.getElementById('b').onclick=()=>{t++;document.title='Tips: '+t};</script></body></html>";
    const a = model.assessResult("make a quick money making app", "", [{ name: "index.html", content: html }]);
    assert.equal(a.produced, true); assert.equal(a.files[0].name, "index.html");
  });
  check("old Knowledge Form and governed metadata do not count as an app", () => {
    const metadata = JSON.stringify({ objective: "make a quick money making app", receipts: ["persisted", "read back"], meaning_elements: ["make", "quick", "money", "app"], runtime_revision: 44, details: "No usable source was created by this run." });
    const a = model.assessResult("make a quick money making app", kf, [
      { name: "knowledgeform_make-a-quick-money-making-app.md", content: kf },
      { name: "governed_objective.json", content: metadata },
      { name: "README.md", content: "Recorded the governed runtime transaction and read back the stored file bytes." },
    ]);
    assert.equal(a.produced, false);
    assert.deepEqual(a.files, []);
  });
  check("README plus actual app returns only the app download", () => {
    const html = "<!doctype html><html><body><h1>Service Revenue</h1><form id='lead-form'></form><script>document.querySelector('form').onsubmit = e => e.preventDefault()</script></body></html>";
    const a = model.assessResult("make a quick money making app", "", [
      { name: "README.md", content: "Open the service revenue app in your browser." },
      { name: "service-revenue-app.html", content: html },
    ]);
    assert.equal(a.produced, true);
    assert.deepEqual(a.files.map(f => f.name), ["service-revenue-app.html"]);
  });
  check("a real written answer is displayed", () => {
    assert.equal(model.assessResult("what is the capital of France", "The capital of France is Paris. It has been the seat of government for most of the country's history and sits on the Seine.", []).produced, true);
  });
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
