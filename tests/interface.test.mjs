import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { resolve } from "node:path";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } },
});
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  process.stdout.write(`PASS ${name}\n`);
}
try {
  const model = await server.ssrLoadModule("/src/lib/ascension/result-model.ts");
  const { knowledgeWorld } = await server.ssrLoadModule("/src/lib/ascension/world-model.ts");
  const { callZai } = await server.ssrLoadModule("/src/lib/ascension/engine/zai.server.ts");
  const access = await server.ssrLoadModule("/src/lib/ascension/source-access.ts");
  const codeWalker = await server.ssrLoadModule("/src/lib/ascension/code-walker.ts");
  const manifestation = await server.ssrLoadModule("/src/lib/ascension/manifestation.ts");
  const modelProvider = await server.ssrLoadModule("/src/lib/ascension/model-provider.ts");
  const run = JSON.parse(await readFile("tests/fixtures/objective-run.json", "utf8"));
  const live = JSON.parse(await readFile("tests/fixtures/world-publication.json", "utf8"));
  const base = { entities: {}, worldModel: {}, chamber: {}, live };
  const world = knowledgeWorld(base);
  check("published forms survive even without relationships", () => {
    assert.equal(world.nodes.length, 3);
    assert.equal(world.edges.length, 1);
    assert.ok(world.nodes.find((n) => n.name === "objective runtime"));
  });
  check("identity, chromosomes and lineage come from the real contract", () => {
    const n = world.nodes.find((n) => n.name === "objective runtime");
    assert.equal(n.persistentId, "PERSIST:objective_runtime:cdc4383b");
    assert.equal(n.sid, "SID:objective_runtime:1:001");
    assert.equal(n.delta.K, 2);
    assert.equal(n.events.length, 2);
    assert.ok(n.chromosome.identity_elements.includes("objectives"));
  });
  check("emergence is mapped as recorded, not invented", () => {
    assert.equal(world.emergences.length, 1);
    assert.equal(world.emergences[0].status, "OBSERVED");
  });
  check("empty publication remains empty", () => {
    assert.equal(knowledgeWorld({ ...base, live: { forms: [] } }).nodes.length, 0);
  });
  check("demo state remains explicitly separate", () => {
    const w = knowledgeWorld({ entities: {}, chamber: {}, worldModel: {} });
    assert.equal(w.source, "demo");
    assert.equal(w.revision, null);
  });
  check("actual branch_id and approach map to selected future", () => {
    const p = model.planningFor(run.result);
    assert.ok(p.branches.some((b) => b.branch_id === p.selected.branch_id));
    assert.equal(model.branchTitle(p.selected), "Build and check in stages");
  });
  check("governed persistence requires the core receipt", () => {
    assert.equal(model.governedPersisted(run), true);
    assert.equal(model.governedPersisted({ ...run, result: {} }), false);
  });
  check("external verified status never becomes ASCENSION verification", () => {
    assert.equal(model.governedPersisted({ ...run, engine: "zai" }), false);
  });
  check("missing persisted delta fails closed", () => {
    const x = structuredClone(run);
    delete x.result.publication.delta_in_persisted_ledger;
    assert.equal(model.governedPersisted(x), false);
  });
  check("general questions do not require a Library Card", () => {
    assert.equal(access.libraryCardAccess("general_question", false).allowed, true);
    assert.equal(access.libraryCardAccess("general_question", false).libraryCardRequired, false);
  });
  check("personalized pathway access requires a Library Card first", () => {
    assert.equal(access.libraryCardAccess("personalized_pathway", false).allowed, false);
    assert.equal(access.libraryCardAccess("personalized_pathway", true).allowed, true);
  });
  check("Code Walker refuses to treat missing permission as access", () => {
    const source = {
      id: "game-1",
      kind: "game_project",
      label: "Game",
      connected: true,
      grantedByUser: true,
      permissions: ["read"],
    };
    const plan = codeWalker.buildCodeWalkerPlan({
      objective: "Add companion AI",
      desiredCapability: "adaptive companion",
      surface: {
        source,
        systemType: "game",
        technologies: ["Unreal"],
        entryPoints: ["project"],
        extensionPoints: ["plugin API"],
        runtimeSignals: ["logs"],
        protectedAreas: [],
      },
    });
    assert.equal(plan.canInspect, true);
    assert.equal(plan.canModify, false);
    assert.equal(plan.canExecute, false);
    assert.ok(plan.blockers.some((x) => x.includes("Write/create/control")));
  });
  check("Code Walker recognizes fully authorized extension flow", () => {
    const source = {
      id: "game-2",
      kind: "game_project",
      label: "Game",
      connected: true,
      grantedByUser: true,
      permissions: ["read", "search", "write", "execute"],
    };
    const plan = codeWalker.buildCodeWalkerPlan({
      objective: "Add companion AI",
      desiredCapability: "adaptive companion",
      surface: {
        source,
        systemType: "game",
        technologies: ["Unreal"],
        entryPoints: ["project"],
        extensionPoints: ["plugin API"],
        runtimeSignals: ["logs"],
        protectedAreas: [],
      },
    });
    assert.equal(plan.canInspect, true);
    assert.equal(plan.canModify, true);
    assert.equal(plan.canExecute, true);
    assert.equal(plan.steps.at(-1).stage, "verify");
  });
  const valid = {
    kind: "artifact",
    title: "Archive guide",
    body: "Created guide for review.",
    pathways: [],
    blend: null,
    files: [{ name: "guide.md", content: "# Guide\nComplete draft." }],
    limitations: ["Draft requires review."],
  };
  check("complete answer and file content is retained", () =>
    assert.deepEqual(model.parseDelivery(valid), valid),
  );
  check("path traversal and duplicate file names are refused", () => {
    assert.throws(() =>
      model.parseDelivery({ ...valid, files: [{ name: "../secret", content: "x" }] }),
    );
    assert.throws(() => model.parseDelivery({ ...valid, files: [...valid.files, ...valid.files] }));
  });
  check("empty or partial generated output is refused", () => {
    assert.throws(() => model.parseDelivery({ ...valid, body: "" }));
    assert.throws(() => model.parseDelivery({ ...valid, files: [] }));
  });
  check("canned Knowledgeverse template is refused", () => {
    assert.throws(
      () =>
        model.parseDelivery({
          kind: "answer",
          title: "Solution",
          body: "The Knowledgeverse has mapped 6 relevant entities. **Identity Phase:** Establish your objective\'s unique chromosome. **Development Phase:** Cultivate relationships. **Emergence Phase:** Allow verified deltas to guide natural evolution.",
          files: [],
          limitations: [],
        }),
      /generic architecture template/,
    );
  });
  const kf =
    "# Knowledge Form: stagedconstruct\n\n- draw\n- linear\n- propulsion\n- engine\n- staged_construct\n- tokens: draw, linear, propulsion";
  const moneyKf = "# Knowledge Form: stagedconstruct\n- make\n- quick\n- money\n- making\n- app";
  check("drawing objective: tokenized Knowledge Form is not a result", () => {
    const a = model.assessResult("draw a linear prpopulsion engine", kf, [
      { name: "knowledge_form.md", content: kf },
    ]);
    assert.equal(a.produced, false);
    assert.equal(a.kind, "drawing");
    assert.equal(a.files.length, 0);
  });
  check("app objective: tokenized Knowledge Form is not a result", () => {
    const a = model.assessResult("make a quick money making app", moneyKf, [
      { name: "form.md", content: moneyKf },
    ]);
    assert.equal(a.produced, false);
    assert.equal(a.kind, "app");
    assert.equal(a.files.length, 0);
  });
  check("plan, receipt and request echo are not results", () => {
    const echo =
      "make a quick money making app\n\nSelected future: Build and check in stages\n\nActions:\n- construct\n- verify\n\nVerification receipts: 1 artifact persisted";
    assert.equal(model.assessResult("make a quick money making app", echo, []).produced, false);
    assert.equal(
      model.assessResult("what is the capital of France", "what is the capital of France", [])
        .produced,
      false,
    );
  });
  check("verified status with only receipts stays not produced", () => {
    assert.throws(() =>
      model.parseDelivery({
        kind: "not_produced",
        title: "x",
        body: "not produced",
        files: [{ name: "a.md", content: "x" }],
        limitations: [],
      }),
    );
    assert.equal(
      model.parseDelivery({
        kind: "not_produced",
        title: "x",
        body: "The requested drawing has not been produced.",
        files: [],
        limitations: [],
      }).kind,
      "not_produced",
    );
  });
  check("valid transported SVG drawing is displayed", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><rect x="10" y="20" width="180" height="20"/><line x1="0" y1="30" x2="200" y2="30"/></svg>';
    const a = model.assessResult("draw a linear propulsion engine", "", [
      { name: "engine.svg", content: svg },
      { name: "form.md", content: kf },
    ]);
    assert.equal(a.produced, true);
    assert.deepEqual(
      a.files.map((f) => f.name),
      ["engine.svg"],
    );
  });
  check("valid transported app code is displayed", () => {
    const html =
      "<!doctype html><html><body><h1>Tip Jar</h1><button id=b>Tip $1</button><script>let t=0;document.getElementById('b').onclick=()=>{t++;document.title='Tips: '+t};</script></body></html>";
    const a = model.assessResult("make a quick money making app", "", [
      { name: "index.html", content: html },
    ]);
    assert.equal(a.produced, true);
    assert.equal(a.files[0].name, "index.html");
  });
  check("a question about an app gets an answer, not a code requirement", () => {
    const question = "What does a booking app do?";
    const answer = "A booking app collects a customer's chosen service and time, checks availability, saves the appointment, and sends a confirmation. A barber might offer hourly slots, prevent duplicate reservations, and let customers cancel.";
    const a = model.assessResult(question, answer, []);
    assert.equal(a.kind, "answer");
    assert.equal(a.produced, true);
  });
  check("the AutoSync status stub cannot pass as an app", () => {
    const fakeApp = [
      '"""Small working application generated through the ASCENSION AutoSync bridge."""',
      "def run(request):",
      "    return f'AutoSync Built Application\\nRequest: {request}\\nStatus: running'",
    ].join("\\n");
    const a = model.assessResult("make a quick money making app", "", [
      { name: "app.py", content: fakeApp },
    ]);
    assert.equal(a.produced, false);
    assert.deepEqual(a.files, []);
  });
  check("old Knowledge Form and governed metadata do not count as an app", () => {
    const metadata = JSON.stringify({
      objective: "make a quick money making app",
      receipts: ["persisted", "read back"],
      meaning_elements: ["make", "quick", "money", "app"],
      runtime_revision: 44,
      details: "No usable source was created by this run.",
    });
    const a = model.assessResult("make a quick money making app", kf, [
      { name: "knowledgeform_make-a-quick-money-making-app.md", content: kf },
      { name: "governed_objective.json", content: metadata },
      {
        name: "README.md",
        content: "Recorded the governed runtime transaction and read back the stored file bytes.",
      },
    ]);
    assert.equal(a.produced, false);
    assert.deepEqual(a.files, []);
  });
  check("README plus actual app returns only the app download", () => {
    const html =
      "<!doctype html><html><body><h1>Service Revenue</h1><form id='lead-form'></form><script>document.querySelector('form').onsubmit = e => e.preventDefault()</script></body></html>";
    const a = model.assessResult("make a quick money making app", "", [
      { name: "README.md", content: "Open the service revenue app in your browser." },
      { name: "service-revenue-app.html", content: html },
    ]);
    assert.equal(a.produced, true);
    assert.deepEqual(
      a.files.map((f) => f.name),
      ["service-revenue-app.html"],
    );
  });
  check("a real written answer is displayed", () => {
    assert.equal(
      model.assessResult(
        "what is the capital of France",
        "The capital of France is Paris. It has been the seat of government for most of the country's history and sits on the Seine.",
        [],
      ).produced,
      true,
    );
  });
  check("a checked multiplication explanation counts as an answer", () => {
    const answer =
      "To multiply, find the total in equal groups. For example, 4 × 3 means four groups of three: 3 + 3 + 3 + 3 = 12, so 4 × 3 = 12. For larger numbers, split a factor into tens and ones and add the partial products.";
    const a = model.assessResult("how do you mutiply", answer, [
      { name: "answer.txt", content: answer },
    ]);
    assert.equal(a.kind, "answer");
    assert.equal(a.produced, true);
    assert.deepEqual(
      a.files.map((file) => file.name),
      ["answer.txt"],
    );
  });
  const deliveryEngine = await server.ssrLoadModule("/src/lib/ascension/engine/delivery.server.ts");
  const shoeObjective = "make a gel support shoe";
  const receipt =
    "# ASCENSION Result\nCreated create/document artifact.\nWorkspace: Public Workspace\nCapability: create\nOutput: document\nFolder: C:\\\\Users\\\\Gordo\\\\Projects\\\\clarity\\\\generated_artifacts\\\\workbench\nFiles:\n- document.md\nValidation: passed";
  const placeholder =
    "# Document\n\n## Request\nmake a gel support shoe\n\n## Subject\ngel support shoe\n\nThis document turns the command into a clear reviewable artifact with context, structure, and next action.";
  check("shoe runtime receipts and placeholder do not count as a design", () => {
    const a = model.assessResult(shoeObjective, receipt, [
      { name: "ascension_result.md", content: receipt },
      { name: "document.md", content: placeholder },
      {
        name: "metadata.json",
        content: JSON.stringify({
          validation: "passed",
          objective: shoeObjective,
          path: "workbench",
        }),
      },
    ]);
    assert.equal(a.kind, "design");
    assert.equal(a.produced, false);
  });
  const runShoe = {
    id: "752d0bcc-3420-417c-abfa-4c02b6901a79",
    objective: shoeObjective,
    status: "running",
    result: { objective_text: shoeObjective },
    completed_at: null,
    created_at: "2026-09-28T13:06:02Z",
  };
  const draftAnswer = {
    kind: "answer",
    title: "Gel support shoe",
    body: "A conceptual shoe design uses a removable dual-density TPU gel heel pod, a broad midfoot support plate, and a breathable toe box. Fit, fatigue, and slip-resistance testing are still required.",
    files: [],
    limitations: ["Concept only; not physically tested."],
  };
  let claims = 0;
  const draftStore = {
    claim: async () => {
      claims++;
      return true;
    },
    complete: async () => {},
    fail: async () => {},
  };
  const noStore = {
    claim: async () => {
      throw new Error("draft must not regenerate");
    },
    complete: async () => {
      throw new Error("draft must not complete again");
    },
    fail: async () => {
      throw new Error("draft must not fail again");
    },
  };
  const earlyArtifact = {
    status: "completed",
    response_payload: { files: [{ name: "document.md", content: placeholder }] },
  };
  const midRun = await deliveryEngine.resolveDelivery({
    run: runShoe,
    artifactStage: earlyArtifact,
    draft: null,
    store: draftStore,
    retry: false,
    now: Date.parse("2026-09-28T13:06:07Z"),
    generate: async () => draftAnswer,
  });
  check("ENGAGE returns an explicitly unverified design draft before runtime completion", () => {
    assert.equal(midRun.status, "completed");
    assert.equal(midRun.source, "external_draft");
    assert.match(midRun.response_payload.body, /dual-density TPU gel heel pod/);
    assert.equal(claims, 1);
  });
  const draftKey = deliveryEngine.artifactSourceKey(runShoe.id, [
    { name: "document.md", content: placeholder },
  ]);
  const repeat = await deliveryEngine.resolveDelivery({
    run: runShoe,
    artifactStage: earlyArtifact,
    draft: {
      status: "completed",
      source_key: draftKey,
      created_at: "2026-09-28T13:06:07Z",
      response_payload: draftAnswer,
      error: null,
      engine_model: "zai",
    },
    store: noStore,
    retry: false,
    now: Date.parse("2026-09-28T13:06:12Z"),
    generate: async () => {
      throw new Error("duplicate model call");
    },
  });
  check("polling reuses the draft without another model call", () => {
    assert.equal(repeat.source, "external_draft");
    assert.equal(repeat.response_payload.body, draftAnswer.body);
  });
  const priorPaidDrafts = process.env.ASCENSION_ALLOW_PAID_DRAFTS;
  delete process.env.ASCENSION_ALLOW_PAID_DRAFTS;
  try {
    const waitingLocal = await deliveryEngine.resolveDelivery({
      run: runShoe,
      artifactStage: null,
      draft: null,
      store: noStore,
      retry: false,
    });
    check("missing engine reports a blocker instead of claiming an answer is being prepared", () => {
      assert.equal(waitingLocal.status, "completed");
      assert.equal(waitingLocal.source, null);
      assert.equal(waitingLocal.response_payload, null);
      assert.match(waitingLocal.error, /no answer engine connected/);
    });
  } finally {
    if (priorPaidDrafts === undefined) delete process.env.ASCENSION_ALLOW_PAID_DRAFTS;
    else process.env.ASCENSION_ALLOW_PAID_DRAFTS = priorPaidDrafts;
  }
  const localDraft = await deliveryEngine.resolveDelivery({
    run: runShoe,
    artifactStage: null,
    draft: {
      status: "completed",
      source_key: `local:${runShoe.id}`,
      created_at: "2026-09-28T13:06:08Z",
      response_payload: draftAnswer,
      error: null,
      engine_model: "qwen3-ascension",
    },
    store: noStore,
    retry: false,
  });
  check("a local model draft appears while the governed run is still running", () => {
    assert.equal(localDraft.status, "completed");
    assert.equal(localDraft.source, "external_draft");
    assert.match(localDraft.response_payload.body, /heel pod/);
  });
  const verifiedShoe = { ...runShoe, status: "verified", completed_at: "2026-09-28T13:06:48Z" };
  const noFilesYet = await deliveryEngine.resolveDelivery({
    run: verifiedShoe,
    artifactStage: null,
    draft: null,
    store: draftStore,
    retry: false,
    now: Date.parse("2026-09-28T13:07:20Z"),
    generate: async () => draftAnswer,
  });
  check("verified status does not withhold the answer while artifact transport is late", () => {
    assert.equal(noFilesYet.source, "external_draft");
    assert.equal(noFilesYet.status, "completed");
  });
  const question = await deliveryEngine.resolveDelivery({
    run: {
      ...runShoe,
      id: "00000000-0000-0000-0000-000000000001",
      objective: "how do you multiply",
      status: "queued",
      result: null,
    },
    artifactStage: null,
    draft: null,
    store: draftStore,
    retry: false,
    generate: async () => ({
      kind: "answer",
      title: "Multiplication",
      body: "Multiplication combines equal groups: three groups of four means 4 + 4 + 4 = 12, so 3 × 4 = 12. For larger numbers, split a factor into parts and add the products.",
      files: [],
      limitations: [],
    }),
  });
  check("ordinary question gets a direct draft answer even while queued", () => {
    assert.equal(question.source, "external_draft");
    assert.match(question.response_payload.body, /3 × 4 = 12/);
  });
  const design =
    "# Gel Support Shoe\nA walking shoe with a dual-density TPU gel heel pod and a broad midfoot support plate. The heel pod is removable through a sealed outsole hatch; the toe box uses breathable mesh. A prototype needs fit testing, compression-cycle testing, and slip-resistance validation before use.";
  const lateResult = await deliveryEngine.resolveDelivery({
    run: verifiedShoe,
    artifactStage: {
      status: "completed",
      response_payload: {
        files: [
          { name: "ascension_result.md", content: receipt },
          { name: "shoe-design.md", content: design },
        ],
      },
    },
    draft: null,
    store: noStore,
    retry: false,
    now: Date.parse("2026-09-28T13:07:21Z"),
  });
  check("late substantive design replaces the early missing result", () => {
    assert.equal(lateResult.status, "completed");
    assert.equal(lateResult.source, "governed");
    assert.match(lateResult.response_payload.body, /dual-density TPU gel heel pod/);
  });
  const original = globalThis.fetch;
  const priorKey = process.env.ZAI_API_KEY;
  const priorLovableKey = process.env.LOVABLE_API_KEY;
  delete process.env.LOVABLE_API_KEY;
  process.env.ZAI_API_KEY = "test-only";
  try {
    const payload = JSON.stringify(valid);
    const bytes = new TextEncoder().encode(
      "data: " + JSON.stringify({ choices: [{ delta: { content: payload } }] }),
    );
    globalThis.fetch = async (_url, init) => {
      assert.ok(init.signal instanceof AbortSignal);
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(bytes.slice(0, 19));
            c.enqueue(bytes.slice(19));
            c.close();
          },
        }),
      );
    };
    const response = await callZai({ system: "test", user: "test" });
    check("stream chunks and final frame without newline are preserved", () =>
      assert.deepEqual(response.json, valid),
    );
    globalThis.fetch = async () => new Response('data: {"error":{"message":"engine failed"}}\n');
    await assert.rejects(() => callZai({ system: "test", user: "test" }), /engine failed/);
    passed++;
    process.stdout.write("PASS upstream stream errors reach the user\n");
  } finally {
    globalThis.fetch = original;
    if (priorKey === undefined) delete process.env.ZAI_API_KEY;
    else process.env.ZAI_API_KEY = priorKey;
    if (priorLovableKey === undefined) delete process.env.LOVABLE_API_KEY;
    else process.env.LOVABLE_API_KEY = priorLovableKey;
  }

  // Production hosted path: Lovable AI is preferred even when a stale Z.AI
  // credential exists, and it never calls localhost.
  const priorLovableModel = process.env.LOVABLE_AI_MODEL;
  process.env.LOVABLE_API_KEY = "lovable-test-only";
  process.env.ZAI_API_KEY = "stale-zai-key";
  delete process.env.LOCAL_LLM_BASE_URL;
  try {
    let sentUrl = "";
    let sentAuth = null;
    let sentLovableKey = null;
    let sentBody = null;
    globalThis.fetch = async (url, init) => {
      sentUrl = String(url);
      sentAuth = init.headers["Authorization"] ?? null;
      sentLovableKey = init.headers["Lovable-API-Key"] ?? null;
      sentBody = JSON.parse(String(init.body));
      return new Response(
        'data: ' +
          JSON.stringify({ choices: [{ delta: { content: "Hosted answer." } }] }) +
          '\n' +
          'data: [DONE]\n',
      );
    };
    const hosted = await callZai({ system: "test", user: "test" });
    check("Lovable AI is the hosted ENGAGE path and does not use localhost", () => {
      assert.equal(sentUrl, "https://ai.gateway.lovable.dev/v1/chat/completions");
      assert.equal(sentAuth, "Bearer lovable-test-only");
      assert.equal(sentLovableKey, "lovable-test-only");
      assert.equal(sentBody.model, "google/gemini-3.1-flash-lite");
      assert.ok(!sentUrl.includes("localhost"));
      assert.equal(hosted.text, "Hosted answer.");
    });
  } finally {
    globalThis.fetch = original;
    if (priorLovableKey === undefined) delete process.env.LOVABLE_API_KEY;
    else process.env.LOVABLE_API_KEY = priorLovableKey;
    if (priorLovableModel === undefined) delete process.env.LOVABLE_AI_MODEL;
    else process.env.LOVABLE_AI_MODEL = priorLovableModel;
    if (priorKey === undefined) delete process.env.ZAI_API_KEY;
    else process.env.ZAI_API_KEY = priorKey;
  }

  // Local engine fallback: no hosted key → explicit local OpenAI-compatible provider,
  // reasoning deltas ignored, inline <think> stripped, no credentials sent.
  const priorLocalBase = process.env.LOCAL_LLM_BASE_URL;
  const priorLocalModel = process.env.LOCAL_LLM_MODEL;
  delete process.env.ZAI_API_KEY;
  delete process.env.LOVABLE_API_KEY;
  process.env.LOCAL_LLM_BASE_URL = "http://localhost:11444/v1";
  process.env.LOCAL_LLM_MODEL = "test-local-model";
  try {
    const frames = [
      JSON.stringify({ choices: [{ delta: { content: "", reasoning: "internal thinking" } }] }),
      JSON.stringify({ choices: [{ delta: { content: "<think>hidden reasoning</think>" } }] }),
      JSON.stringify({ choices: [{ delta: { content: "Visible answer text." } }] }),
    ];
    let sentAuth = null;
    let sentBody = null;
    let sentUrl = "";
    globalThis.fetch = async (url, init) => {
      sentUrl = String(url);
      sentAuth = init.headers["Authorization"] ?? null;
      sentBody = JSON.parse(String(init.body));
      return new Response(frames.map((frame) => `data: ${frame}\n`).join("") + "data: [DONE]\n");
    };
    const localResult = await callZai({ system: "test", user: "test" });
    check("local answer engine serves ENGAGE without any credential", () => {
      assert.equal(sentUrl, "http://localhost:11444/v1/chat/completions");
      assert.equal(sentAuth, null);
      assert.equal(sentBody.model, "test-local-model");
      assert.equal(sentBody.max_tokens, 4096);
      assert.equal(localResult.text, "Visible answer text.");
      assert.equal(localResult.model, "test-local-model");
    });

    process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:11434/v1";
    process.env.LOCAL_LLM_MODEL = "qwen3-ascension:latest";
    globalThis.fetch = async (url, init) => {
      sentUrl = String(url);
      sentBody = JSON.parse(String(init.body));
      assert.equal(init.headers.Authorization, undefined);
      assert.equal(init.headers.Accept, "application/x-ndjson");
      const bytes = new TextEncoder().encode([
        JSON.stringify({ message: { thinking: "private reasoning", content: "" }, done: false }),
        JSON.stringify({ message: { content: "Visible café " }, done: false }),
        JSON.stringify({ message: { content: "answer." }, done: true, done_reason: "stop" }),
      ].join("\n"));
      return new Response(new ReadableStream({ start(controller) {
        // Split inside UTF-8 and JSON frames; the final frame has no newline.
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      } }));
    };
    const native = await callZai({ system: "test", user: "draw programmable cubits" });
    check("installed Qwen3 uses native Ollama with thinking disabled and preserves answer chunks", () => {
      assert.equal(sentUrl, "http://127.0.0.1:11434/api/chat");
      assert.equal(sentBody.model, "qwen3-ascension:latest");
      assert.equal(sentBody.think, false);
      assert.equal(sentBody.options.num_predict, 4096);
      assert.equal(native.text, "Visible café answer.");
    });
    globalThis.fetch = async () => new Response(JSON.stringify({
      message: { content: "", thinking: "unfinished reasoning" }, done: true, done_reason: "length",
    }));
    await assert.rejects(() => callZai({ system: "test", user: "test" }), /output limit before producing an answer/);
    globalThis.fetch = async () => new Response(JSON.stringify({
      message: { content: "<think>unfinished reasoning" }, done: true,
    }));
    await assert.rejects(() => callZai({ system: "test", user: "test" }), /thinking without a final answer/);
    globalThis.fetch = async () => new Response('{"error":"Ollama model failed"}\n');
    await assert.rejects(() => callZai({ system: "test", user: "test" }), /Ollama model failed/);
    globalThis.fetch = async () => new Response('{"message":{"content":""},"done":true}\n');
    await assert.rejects(() => callZai({ system: "test", user: "test" }), /empty response/);
    passed++;
    process.stdout.write("PASS native engine failures and thinking-only responses remain errors\n");
  } finally {
    globalThis.fetch = original;
    if (priorLocalBase === undefined) delete process.env.LOCAL_LLM_BASE_URL;
    else process.env.LOCAL_LLM_BASE_URL = priorLocalBase;
    if (priorLocalModel === undefined) delete process.env.LOCAL_LLM_MODEL;
    else process.env.LOCAL_LLM_MODEL = priorLocalModel;
    if (priorLovableKey === undefined) delete process.env.LOVABLE_API_KEY;
    else process.env.LOVABLE_API_KEY = priorLovableKey;
    if (priorKey === undefined) delete process.env.ZAI_API_KEY;
    else process.env.ZAI_API_KEY = priorKey;
  }
  /* -------------------- ENVISION manifestation + model provider -------------------- */

  check("manifestation phases follow the 700/1500/2300 boundaries", () => {
    const phase = manifestation.manifestationPhase;
    assert.equal(phase(-1), "idle");
    assert.equal(phase(0), "possibility");
    assert.equal(phase(699), "possibility");
    assert.equal(phase(700), "condensation");
    assert.equal(phase(1499), "condensation");
    assert.equal(phase(1500), "reveal");
    assert.equal(phase(2299), "reveal");
    assert.equal(phase(2300), "stabilized");
    assert.equal(phase(99999), "stabilized");
  });
  check("manifestation progress stays clamped and completes", () => {
    assert.equal(manifestation.phaseProgress(-5), 0);
    assert.equal(manifestation.phaseProgress(2300), 1);
    assert.equal(manifestation.phaseProgress(50000), 1);
    for (let ms = 0; ms <= 2400; ms += 50) {
      const p = manifestation.phaseProgress(ms);
      assert.ok(p >= 0 && p <= 1, `progress out of range at ${ms}ms`);
    }
  });
  check("assembly spin decelerates monotonically into a living drift", () => {
    let prev = 0;
    for (let ms = 0; ms <= 4000; ms += 100) {
      const spin = manifestation.assemblySpin(ms / 1000);
      assert.ok(spin >= prev - 1e-9, `spin went backwards at ${ms}ms`);
      prev = spin;
    }
    assert.equal(manifestation.assemblySpin(0), 0);
    // After stabilization only a slow drift remains.
    const late = manifestation.assemblySpin(4) - manifestation.assemblySpin(3);
    const early = manifestation.assemblySpin(0.5) - manifestation.assemblySpin(0);
    assert.ok(late < early / 8, "stabilized spin must be far calmer than possibility");
  });
  check("parts lock sequentially and always finish before stabilization", () => {
    for (let i = 0; i < 40; i++) {
      const lock = manifestation.partLockMs(i, i * 0.31);
      assert.ok(lock >= 1700 && lock < 2300, `lock out of reveal window at ${i}: ${lock}`);
    }
  });
  check("linear propulsion specs only appear when the knowledge identifies them", () => {
    const unrelated = manifestation.linearSpecFromText("design a turbofan engine", "Turbofan bypass concept", null);
    assert.equal(unrelated, null);
    const generic = manifestation.linearSpecFromText("draw a linear propulsion engine", "Linear propulsion concept", "uses coils along rails");
    assert.notEqual(generic, null);
    assert.equal(generic.volts, null);
    assert.equal(generic.coils, 3);
    assert.equal(generic.rails, 2);
    const owned = manifestation.linearSpecFromText(
      "draw my linear propulsion engine",
      "Linear propulsion concept",
      "48 V system, 9 coils on 3 rails with stasis levitation and piezoelectric silicone rails",
    );
    assert.notEqual(owned, null);
    assert.equal(owned.volts, 48);
    assert.equal(owned.coils, 9);
    assert.equal(owned.rails, 3);
    assert.equal(owned.stasis, true);
    assert.equal(owned.piezo, true);
  });
  check("hunyuan3d is honestly reported as not wired without configuration", () => {
    const status = modelProvider.hunyuan3DStatus();
    assert.equal(status.wired, false);
    assert.match(status.detail, /not connected/i);
  });
  check("unconfigured provider resolves to null without fetching", async () => {
    const original = globalThis.fetch;
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    };
    try {
      const resolved = await modelProvider.resolvePathwayModel({
        id: "path-1",
        label: "Linear propulsion",
        summary: "concept",
        spiralForm: null,
      });
      assert.equal(resolved, null);
      assert.equal(fetched, false);
    } finally {
      globalThis.fetch = original;
    }
  });
  check("glb parser reads triangulated meshes and fails closed on junk", () => {
    const buildTestGlb = () => {
      const positions = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint16Array([0, 1, 2]);
      const bin = new Uint8Array(44);
      bin.set(new Uint8Array(positions.buffer), 0);
      bin.set(new Uint8Array(indices.buffer), 36);
      const gltf = {
        asset: { version: "2.0" },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, translation: [0, 5, 0] }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        accessors: [
          { componentType: 5126, type: "VEC3", count: 3, bufferView: 0 },
          { componentType: 5123, type: "SCALAR", count: 3, bufferView: 1 },
        ],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 36 },
          { buffer: 0, byteOffset: 36, byteLength: 6 },
        ],
        buffers: [{ byteLength: 44 }],
      };
      const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
      const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
      const total = 28 + jsonBytes.length + jsonPad + bin.length;
      const buffer = new ArrayBuffer(total);
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);
      view.setUint32(0, 0x46546c67, true);
      view.setUint32(4, 2, true);
      view.setUint32(8, total, true);
      view.setUint32(12, jsonBytes.length + jsonPad, true);
      view.setUint32(16, 0x4e4f534a, true);
      bytes.set(jsonBytes, 20);
      for (let i = 0; i < jsonPad; i++) bytes[20 + jsonBytes.length + i] = 0x20; // spec: space padding
      view.setUint32(20 + jsonBytes.length + jsonPad, bin.length, true);
      view.setUint32(24 + jsonBytes.length + jsonPad, 0x004e4942, true);
      bytes.set(bin, 28 + jsonBytes.length + jsonPad);
      return buffer;
    };
    const parsed = modelProvider.parseGlbVertices(buildTestGlb());
    assert.notEqual(parsed, null);
    assert.equal(parsed.length, 18);
    assert.ok(Math.abs(parsed[0] + 1) < 1e-5);
    assert.ok(Math.abs(parsed[1] - 5) < 1e-5);
    assert.ok(Math.abs(parsed[5] - 1) < 1e-5, "flat normal should face +z");
    assert.equal(modelProvider.parseGlbVertices(new ArrayBuffer(12)), null);
    assert.equal(modelProvider.parseGlbVertices(new TextEncoder().encode("not a glb at all").buffer), null);
  });

  process.stdout.write(`${passed} interface contract checks passed\n`);
} finally {
  await server.close();
}
