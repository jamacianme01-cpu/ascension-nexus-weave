import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";

const idA = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const idB = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const tokenA = "11111111-1111-4111-8111-111111111111";
const tokenB = "22222222-2222-4222-8222-222222222222";
const priorResult = { kind: "answer", title: "Earlier design", body: "The earlier draft uses a removable sensor in a folding frame.",
  pathways: [{ id: "path-a", label: "Removable sensor", summary: "A removable sensor mounts in the folding frame.", steps: ["Mount the sensor."], tradeoffs: [] }],
  blend: null, files: [], limitations: [], model_url: "https://example.invalid/large.glb" };
const parent = { id: idA, objective: "Make an adjustable workbench", created_at: "2026-10-08T00:00:00Z" };
const rpcCalls = [], stageQueries = [];
globalThis.__iterationDatabase = {
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    if (name === "ascension_guest_bundle") return { data: args.p_guest_token === tokenA
      ? { run: parent, delivery_stage: null, draft_stage: { status: "completed", response_payload: priorResult } } : null, error: null };
    if (name === "ascension_guest_submit") return { data: { request: { ...parent, id: idB }, guest_token: tokenB }, error: null };
    throw new Error("Unexpected RPC");
  },
  from(table) {
    const query = { insert() { this.inserting = true; return this; }, select() { return this; }, eq() { return this; },
      in(_field, ordinals) { stageQueries.push(ordinals); return this; },
      order(_field, options) { this.descending = options.ascending === false; return this; }, limit() { return this; },
      async maybeSingle() { return { data: table === "ascension_execution_requests" ? parent
        : table === "ascension_run_stages" ? { response_payload: priorResult } : null, error: null }; },
      async single() { return { data: { ...parent, id: idB }, error: null }; } };
    return query;
  },
};
globalThis.__iterationAuthContext = { supabase: globalThis.__iterationDatabase, userId: "test-user" };
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  ssr: { noExternal: ["@tanstack/react-start"] },
  resolve: { alias: { "@": resolve("src") } }, plugins: [{ name: "isolated-iteration-intake", enforce: "pre",
    resolveId(source) { if (source === "@tanstack/react-start") return "\0iteration-start"; },
    load(id) {
      if (id === "\0iteration-start") return `export function createServerFn() {
        let validate = value => value;
        const chain = { middleware() { return chain; }, inputValidator(fn) { validate = fn; return chain; },
          handler(fn) { return async options => fn({ data: validate(options?.data), context: globalThis.__iterationAuthContext }); } };
        return chain;
      }`;
      if (id.endsWith("/integrations/supabase/client.ts")) return "export const supabase = globalThis.__iterationDatabase;";
      if (id.endsWith("/integrations/supabase/auth-middleware.ts")) return "export const requireSupabaseAuth = {};";
    },
  }] });
let passed = 0;
function pass(name) { passed++; console.log(`PASS ${name}`); }
try {
  const iteration = await server.ssrLoadModule("/src/lib/ascension/iteration-model.ts");
  const guest = await server.ssrLoadModule("/src/lib/ascension/guest.functions.ts");
  const auth = await server.ssrLoadModule("/src/lib/ascension/objectives.functions.ts");
  const bytes = new Map();
  const storage = { getItem: key => bytes.get(key) ?? null, setItem: (key, value) => bytes.set(key, value) };
  iteration.rememberQuestion({ ...parent, access: "guest", guestToken: tokenA }, storage);
  iteration.rememberQuestion({ id: idB, objective: parent.objective, created_at: "2026-10-09T00:00:00Z", access: "guest", guestToken: tokenB, parentId: idA }, storage);
  const afterRestart = iteration.readSavedQuestions(storage);
  assert.equal(afterRestart.length, 2);
  assert.equal(afterRestart.find(item => item.id === idA).guestToken, tokenA);
  assert.equal(afterRestart.find(item => item.id === idB).guestToken, tokenB);
  assert.equal(afterRestart[0].parentId, idA);
  iteration.rememberQuestion({ ...afterRestart[0], parentId: undefined }, storage);
  assert.equal(iteration.readSavedQuestions(storage)[0].parentId, idA);
  pass("original and revised questions survive a new session with their own guest access and ancestry");

  const unavailable = { getItem() { throw new Error("Storage disabled"); }, setItem() { throw new Error("Storage disabled"); } };
  assert.deepEqual(iteration.readSavedQuestions(unavailable), []);
  assert.equal(iteration.rememberQuestion({ ...parent, access: "guest", guestToken: tokenA }, unavailable).length, 1);
  storage.setItem(iteration.SAVED_QUESTIONS, "corrupt"); assert.deepEqual(iteration.readSavedQuestions(storage), []);
  pass("unavailable or corrupt browser storage does not break the question editor");

  const path = iteration.pathwayBlendInput(idA, parent.objective, priorResult.pathways[0]);
  const part = { name: "Sensor", purpose: "Observe the frame.", location: "At the frame edge.", operation: "Read the selected condition.", connections: "Links to the controller.", limitations: "Range unspecified.", x: 0.5, y: 0.5 };
  const component = iteration.partBlendInput(idB, parent.objective, priorResult.pathways[0], part);
  const variable = iteration.partBlendInput(idB, parent.objective, priorResult.pathways[0], part, "operation");
  assert.notEqual(component.key, variable.key);
  let selected = iteration.toggleBlendInput([], path);
  selected = iteration.toggleBlendInput(selected, variable);
  iteration.saveBlendSelection(selected, storage);
  assert.deepEqual(iteration.readBlendSelection(storage), selected);
  assert.equal(iteration.toggleBlendInput(selected, path).length, 1);
  const blend = iteration.revisionEvidence("blend", selected, "Use a removable mounting point.").map(JSON.parse);
  assert.equal(blend[0].selection_authority, "USER_SELECTED");
  assert.equal(blend[0].changes, "Use a removable mounting point.");
  assert.equal(blend.filter(item => item.input === 1).map(item => item.description).join(""), path.description);
  assert.equal(blend.filter(item => item.input === 2).map(item => item.description).join(""), part.operation);
  assert.ok(blend.every(item => item.name !== "Unselected automatic blend"));
  assert.throws(() => iteration.revisionEvidence("blend", [path]), /at least two/);
  pass("a new blend carries only explicitly selected pathways, parts or variables, including cross-result inputs");

  const long = { ...path, description: '"\n\\'.repeat(1600) };
  const packed = iteration.revisionEvidence("blend", [long, variable]);
  assert.ok(packed.every(item => item.length <= 2000));
  assert.equal(packed.map(JSON.parse).filter(item => item.input === 1).map(item => item.description).join(""), long.description);
  pass("long blend descriptions survive intake limits as complete reconstructable records");

  const context = iteration.priorResultContext(parent, priorResult, "refine");
  assert.equal(JSON.parse(context).prior_result.body, priorResult.body);
  assert.doesNotMatch(context, /large\.glb/);
  assert.equal(iteration.parentQuestionId([context]), idA);
  const revised = iteration.revisionEvidence("new_answers");
  assert.equal(JSON.parse(revised[0]).action, "new_answers");
  assert.deepEqual(iteration.editableEvidence(["User source", context, { parent_request_id: idA }, ...revised]), ["User source"]);
  pass("new answers compare with the prior result without recursively copying generated context into the editor");

  await guest.submitGuestObjective({ data: { objective: parent.objective, evidence: revised,
    parentRequestId: idA, parentGuestToken: tokenA, followUp: "refine" } });
  const submission = rpcCalls.find(call => call.name === "ascension_guest_submit");
  const carried = submission.args.p_evidence.map(item => { try { return JSON.parse(item); } catch { return null; } });
  assert.equal(carried.find(item => item?.source === "ASCENSION_PARENT_CONTEXT").prior_result.title, priorResult.title);
  assert.equal(submission.args.p_parent_guest_token, tokenA);
  const submissionsBefore = rpcCalls.filter(call => call.name === "ascension_guest_submit").length;
  await assert.rejects(() => guest.submitGuestObjective({ data: { objective: parent.objective,
    parentRequestId: idA, parentGuestToken: tokenB, followUp: "refine" } }), /unavailable/);
  assert.equal(rpcCalls.filter(call => call.name === "ascension_guest_submit").length, submissionsBefore);
  pass("guest revisions carry the current generated answer and require the original question's token");

  await auth.submitObjective({ data: { objective: parent.objective, evidence: revised, parentRequestId: idA, followUp: "refine" } });
  assert.deepEqual(stageQueries[0], [100, 102]);
  pass("signed-in revisions read the generated answer as well as the older delivery stage");
  console.log(`${passed} iteration workflow checks passed`);
} finally { await server.close(); delete globalThis.__iterationDatabase; delete globalThis.__iterationAuthContext; }
