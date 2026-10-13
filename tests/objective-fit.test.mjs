import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";

const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } },
  plugins: [{ name: "isolated-meaning-review", enforce: "pre", load(id) {
    if (id.endsWith("/engine/knowledge.server.ts")) return `
      export async function retrieveKnowledge() { return { evidence: [] }; }
      export function formatKnowledgeEvidence() { return 'No relevant records.'; }
      export function formatInternalConnection() { return ''; }
    `;
  } }] });
const originalFetch = globalThis.fetch;
const priorKey = process.env.LOVABLE_API_KEY;
const priorHostedOptIn = process.env.ASCENSION_ALLOW_LOVABLE_AI;
process.env.LOVABLE_API_KEY = "test-only";
process.env.ASCENSION_ALLOW_LOVABLE_AI = "true";
let passed = 0;
function pass(name) { passed++; console.log(`PASS ${name}`); }
function gateway(responses) {
  const calls = [];
  let lastDraft = null;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    // These scenarios isolate objective-meaning repairs. The Spiral engine may
    // independently request one extra expansion; deliberately return the same
    // underexpanded draft to verify meaning repair still catches wrong subjects,
    // without consuming the meaning-review verdict fixtures.
    if (String(request.messages?.[0]?.content ?? "").includes("SPIRAL REPAIR REQUIRED") && lastDraft) {
      return new Response("data: " + JSON.stringify({
        choices: [{ delta: { content: JSON.stringify(lastDraft) } }],
      }) + "\n");
    }
    calls.push(request);
    assert.ok(responses.length, "Unexpected additional provider call");
    const response = responses.shift();
    if (response?.kind) lastDraft = response;
    return new Response("data: " + JSON.stringify({ choices: [{ delta: { content: JSON.stringify(response) } }] }) + "\n");
  };
  return calls;
}
function verdict(delivery, rejected = [], question = null) {
  const targets = ["result", ...delivery.pathways.map((_, i) => `pathway_${i + 1}`), ...(delivery.blend ? ["blend"] : [])];
  return { interpretation: "The subject and requested outcome in the original objective.", question,
    checks: targets.map(target => ({ target, matches: !rejected.includes(target),
      reason: rejected.includes(target) ? "This target substitutes a different subject or repeats the earlier answer." : "This target follows the submitted objective." })) };
}
try {
  const model = await server.ssrLoadModule("/src/lib/ascension/result-model.ts");
  const fit = await server.ssrLoadModule("/src/lib/ascension/engine/objective-fit.server.ts");
  const engine = await server.ssrLoadModule("/src/lib/ascension/engine/delivery.server.ts");
  const wrong = model.parseDelivery({ kind: "answer", title: "FPGA-Driven DCI Termination",
    body: "An FPGA drives an adjustable electrical termination network. Resistance tuning addresses signal reflections, with a precision reference resistor used to calibrate the I/O banks. This is an electronic impedance concept.",
    files: [], limitations: [], pathways: [{ id: "path_1", label: "MEMS impedance switching",
      summary: "An electrical resistor ladder selects signal termination paths through MEMS switches.",
      steps: ["Arrange the resistor network around the input connection.", "Place the controller beside the switch array."], tradeoffs: [] }] });
  const correct = model.parseDelivery({ kind: "answer", title: "Requested end-region concept",
    body: "The design keeps the user-defined programmable end regions as its subject. A schematic shows the end regions, an observation layer, and an abstract control interface. Proposed functions are conceptual and their operation remains unverified.",
    files: [], limitations: ["Conceptual only."], pathways: [{ id: "path_1", label: "End-region schematic",
      summary: "The schematic preserves the requested end regions, showing their positions and an abstract control boundary.",
      steps: ["Show the named end regions as the primary subject of the diagram.", "Place conceptual observation and control annotations around those regions."], tradeoffs: [] }] });
  const request = { id: "request", objective: "make programmable telemore ends", result: null,
    evidence: ["Preserve the end-region subject; do not replace it with signal termination."], status: "running",
    created_at: "2026-10-09T00:00:00Z", updated_at: "2026-10-09T00:00:00Z" };
  let calls = gateway([wrong, verdict(wrong, ["result", "pathway_1"]), correct, verdict(correct)]);
  const repaired = await engine.externalProductDraft(request, []);
  assert.equal(calls.length, 4);
  assert.equal(repaired.title, correct.title);
  assert.equal(await fit.hasCurrentObjectiveFit(request.objective, repaired), true);
  assert.notEqual(repaired.pathways[0].id, wrong.pathways[0].id);
  assert.equal(JSON.parse(calls[1].messages[1].content).original_objective, request.objective);
  assert.equal(JSON.parse(calls[2].messages[1].content).original_objective, request.objective);
  assert.doesNotMatch(calls[1].messages[1].content, /ASCENSION INTERNAL KNOWLEDGE/);
  pass("unrelated detailed pathways are repaired against the unchanged original request before release");

  const withBlend = model.parseDelivery({ ...correct, blend: { ...wrong.pathways[0], id: "blend",
    blend_from: ["path_1"], blend_reason: "Unrelated electrical synthesis." } });
  for (const target of ["pathway_1", "blend"]) {
    gateway([verdict(withBlend, [target])]);
    const review = await fit.reviewObjectiveFit(request, withBlend);
    assert.equal(review.matches, false); assert.match(review.issues[0], new RegExp(target));
  }
  pass("one unrelated pathway or blend cannot hide behind a matching main answer");

  let system;
  for (const objective of ["make a gel support shoe", "design a folding workbench", "draw my user-defined memory lattice"]) {
    calls = gateway([verdict(correct)]);
    await fit.reviewObjectiveFit({ objective }, correct);
    assert.equal(JSON.parse(calls[0].messages[1].content).original_objective, objective);
    if (system) assert.equal(calls[0].messages[0].content, system);
    system = calls[0].messages[0].content;
  }
  pass("the same meaning check applies across objectives without subject-specific routing");

  const bad = verdict(correct);
  bad.checks[1].target = "result";
  gateway([bad]); await assert.rejects(() => fit.reviewObjectiveFit(request, correct), /exactly once/);
  const omitted = verdict(correct); omitted.checks.pop();
  gateway([omitted]); await assert.rejects(() => fit.reviewObjectiveFit(request, correct), /incomplete/);
  pass("omitted or duplicate target checks cannot authorize a result");

  const iteration = await server.ssrLoadModule("/src/lib/ascension/iteration-model.ts");
  const revisedRequest = { ...request, evidence: [...iteration.revisionEvidence("new_answers"),
    iteration.priorResultContext({ id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", objective: request.objective }, correct, "refine")] };
  gateway([verdict(correct)]);
  const exactRepeat = await fit.reviewObjectiveFit(revisedRequest, correct);
  assert.equal(exactRepeat.matches, false);
  assert.match(exactRepeat.issues[0], /repeats an earlier answer/);
  const novel = model.parseDelivery({ ...correct, pathways: [{ ...correct.pathways[0],
    summary: "A separate modular end-region design uses individually adjustable annotation nodes.",
    steps: ["Arrange each named end region as an independent module.", "Show the connections between modules."] }] });
  calls = gateway([correct, verdict(correct), novel, verdict(novel)]);
  const freshResult = await engine.externalProductDraft(revisedRequest, []);
  assert.equal(calls.length, 4);
  assert.equal(freshResult.pathways[0].summary, novel.pathways[0].summary);
  pass("new answers repair exact repeats even when the model's own review accepts them");

  calls = gateway([wrong, verdict(wrong, ["result"]), wrong, verdict(wrong, ["result"])]);
  await assert.rejects(() => engine.externalProductDraft(request, []), /still does not match/);
  assert.equal(calls.length, 4);
  gateway([correct, verdict(correct, [], "Which of the two defined end-region meanings should this use?")]);
  await assert.rejects(() => engine.externalProductDraft(request, []), /detail is needed/);
  pass("meaning repair is bounded and essential ambiguity cannot become a guessed result");

  const stamped = await fit.stampObjectiveFit(request.objective, correct, "Keep the requested subject.");
  assert.equal(await fit.hasCurrentObjectiveFit(request.objective, { ...stamped,
    pathways: [{ ...stamped.pathways[0], model_url: "https://example.invalid/current.glb", model_status: "completed" }] }), true);
  assert.equal(await fit.hasCurrentObjectiveFit("different objective", stamped), false);
  assert.equal(await fit.hasCurrentObjectiveFit(request.objective, { ...stamped, body: wrong.body }), false);
  assert.equal(await fit.hasCurrentObjectiveFit(request.objective, model.parseDelivery(stamped)), true);
  pass("checked meaning survives model completion but expires when the objective or answer changes");

  let claims = 0, generated = 0;
  const store = { claim: async () => { claims++; return true; }, complete: async () => {}, fail: async () => {} };
  const legacy = { status: "completed", source_key: engine.artifactSourceKey(request.id, []),
    created_at: request.created_at, response_payload: { ...correct, pathways: [{ ...correct.pathways[0], model_url: "https://example.invalid/approved.glb" }] },
    error: null, engine_model: "external" };
  const review = async () => ({ interpretation: "Original subject.", question: null, matches: true, issues: [] });
  const kept = await engine.resolveDelivery({ run: request, draft: legacy, artifactStage: null, retry: false, store,
    review, generate: async () => { generated++; return repaired; } });
  assert.equal(claims, 0); assert.equal(generated, 0);
  assert.equal(kept.response_payload.pathways[0].id, legacy.response_payload.pathways[0].id);
  assert.equal(kept.response_payload.pathways[0].model_url, "https://example.invalid/approved.glb");
  await engine.resolveDelivery({ run: request, draft: legacy, artifactStage: null,
    retry: false, store, review: async () => { throw new Error("Must reuse the checked result"); } });
  assert.equal(claims, 0);
  await engine.resolveDelivery({ run: request, draft: legacy, artifactStage: null,
    retry: true, store, generate: async () => { generated++; return repaired; } });
  assert.equal(generated, 1);
  pass("matching saved designs keep their meshes, polling reuses them, and explicit retry generates again");

  const frozen = await engine.resolveDelivery({ run: { ...request, status: "verified", result: { requested_output: { primary_artifact: "later.md" } } },
    draft: legacy, artifactStage: { status: "completed", response_payload: { files: [{ name: "later.md", content: wrong.body }] } },
    retry: false, store, review: async () => { throw new Error("Must keep the delivered version"); },
    generate: async () => { throw new Error("Must not replace a saved result"); } });
  assert.equal(frozen.response_payload.title, correct.title);
  assert.equal(frozen.response_payload.pathways[0].model_url, "https://example.invalid/approved.glb");
  pass("later runtime transport cannot replace an already delivered answer or approved model");

  const wrongRun = { ...request, status: "verified", result: { requested_output: { primary_artifact: "result.md" } } };
  generated = 0;
  const result = await engine.resolveDelivery({ run: wrongRun, artifactStage: { status: "completed",
    response_payload: { files: [{ name: "result.md", content: wrong.body }] } }, draft: null, retry: false, store,
    review: async () => ({ interpretation: "Original subject.", question: null, matches: false, issues: ["Unrelated electrical subject"] }),
    generate: async (_run, _files, feedback) => { generated++; assert.equal(feedback.matches, false); return repaired; } });
  assert.equal(result.source, "external_draft"); assert.equal(generated, 1);
  assert.equal(result.response_payload.title, correct.title);
  pass("a runtime status of verified cannot bypass matching the requested subject");

  console.log(`${passed} objective meaning checks passed`);
} finally {
  globalThis.fetch = originalFetch;
  if (priorKey === undefined) delete process.env.LOVABLE_API_KEY; else process.env.LOVABLE_API_KEY = priorKey;
  if (priorHostedOptIn === undefined) delete process.env.ASCENSION_ALLOW_LOVABLE_AI; else process.env.ASCENSION_ALLOW_LOVABLE_AI = priorHostedOptIn;
  await server.close();
}

