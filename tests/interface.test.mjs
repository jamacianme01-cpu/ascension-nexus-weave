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
  const { callApprovedAnswer } = await server.ssrLoadModule("/src/lib/ascension/engine/approved-answer.server.ts");
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
    assert.equal(model.governedPersisted({ ...run, engine: "external" }), false);
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
  const originalOneAnswer = {
    objective: "How can the Tree guide the user?",
    result: { objective_delivery: {
      kind: "answer",
      title: "Living Tree",
      body: "The Tree speaks to the user naturally while preserving the original objective, then remains visible as the owner works on the same evolving design. Its guidance is grounded in recorded runtime output.",
      files: [], limitations: [], pathways: [],
    }},
  };
  const originalDelivery = deliveryEngine.governedDelivery(originalOneAnswer, []);
  check("owner-authored single output survives intact without BLEND or artificial pathways", () => {
    assert.equal(originalDelivery.kind, "answer");
    assert.equal(originalDelivery.title, "Living Tree");
    assert.equal(originalDelivery.pathways.length, 0);
    assert.equal(originalDelivery.blend, null);
    assert.equal(originalDelivery.body, originalOneAnswer.result.objective_delivery.body);
  });
  const oneModel = deliveryEngine.governedDelivery({
    objective: "Design a care drone for people with dementia",
    result: { objective_delivery: {
      kind: "design", title: "Care companion drone",
      body: "A dementia-care companion drone is designed to assist with orientation and provide connected memory support, with components intended for the owner's original sensing and guidance architecture.",
      pathways: [{
        id: "one", label: "Owner's original companion", summary: "Actual connected companion design",
        steps: ["Preserve original sensing and assistance functions."], tradeoffs: [],
        generated_image_url: "https://owner.example.test/care-companion.png",
        model_url: "https://owner.example.test/care-companion.glb",
      }],
      blend: null, files: [], limitations: [],
    }},
  }, []);
  check("one original design keeps its actual image, GLB and pathway without a fabricated BLEND", () => {
    assert.equal(oneModel.pathways.length, 1);
    assert.equal(oneModel.blend, null);
    assert.equal(oneModel.pathways[0].generated_image_url, "https://owner.example.test/care-companion.png");
    assert.equal(oneModel.pathways[0].model_url, "https://owner.example.test/care-companion.glb");
  });
  const actualLateFile = "<!doctype html><html><body><h1>Revenue app</h1><form id='lead-form'><input name='contact' required/><button>Save</button></form><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();document.querySelector('h1').textContent='Saved';};</script></body></html>";
  const lateOutput = deliveryEngine.governedDelivery({
    objective: "make a quick money making app",
    result: { objective_delivery: {
      kind: "not_produced", title: "Unfinished earlier",
      body: "The requested app has not been produced.",
      files: [], limitations: [],
    }},
  }, [{name: "revenue.html", content: actualLateFile}]);
  check("late genuine runtime artifact supersedes an earlier not-produced marker", () => {
    assert.equal(lateOutput.kind, "artifact");
    assert.deepEqual(lateOutput.files.map(f=>f.name), ["revenue.html"]);
    assert.equal(lateOutput.files[0].content, actualLateFile);
  });
  const ownerRun = {
    id: "12345678-90ab-4cde-8f12-123456789abc",
    objective: originalOneAnswer.objective,
    status: "verified",
    result: originalOneAnswer.result,
    created_at: "2026-11-20T10:00:00Z",
    completed_at: "2026-11-20T10:01:00Z",
  };
  const noSubstitute = {
    claim: async () => {throw Error("Never start an external draft for actual core result");},
    complete: async () => {throw Error("No external draft should complete");},
    fail: async () => {throw Error("No external draft should fail");},
  };
  const exactOwner = await deliveryEngine.resolveDelivery({
    run: ownerRun, artifactStage: null, draft: null,
    store: noSubstitute, retry: false,
  });
  check("real core answer takes precedence and is not rejected for missing three results", () => {
    assert.equal(exactOwner.status, "completed");
    assert.equal(exactOwner.source, "governed");
    assert.equal(exactOwner.response_payload.body, originalOneAnswer.result.objective_delivery.body);
  });
  const failedExternal = await deliveryEngine.resolveDelivery({
    run: { ...ownerRun, result: {}, status: "failed" },
    artifactStage: null, draft: null, retry: false,
    store: { claim: async () => true, complete: async () => {
      throw Error("Must not cache canned recovery");
    }, fail: async () => {} },
    generate: async () => { throw Error("HTTP 429 unavailable"); },
  });
  check("provider failure never fabricates canned drones or substitute answers", () => {
    assert.equal(failedExternal.response_payload, null);
    assert.match(failedExternal.error, /HTTP 429 unavailable/);
  });
  const spiralPaths = [
    { id: "one", label: "Coils", summary: "Coil induction" },
    { id: "two", label: "Rotor", summary: "Rotating field" },
    { id: "three", label: "Linear", summary: "Linear motion" },
  ];
  check("Spiral repairs collapsed physical design pathways", () => {
    assert.equal(deliveryEngine.needsSpiralExpansionRepair("Design a propulsion engine", [], [],
      { pathways: spiralPaths.slice(0, 1), blend: null }), true);
  });
  check("Spiral preserves complete distinct pathways and blend", () => {
    assert.equal(deliveryEngine.needsSpiralExpansionRepair("Design a propulsion engine", [], [],
      { pathways: spiralPaths, blend: { id: "blend" } }), false);
  });
  check("Spiral detects repeated routes rather than counting duplicate labels", () => {
    assert.equal(deliveryEngine.needsSpiralExpansionRepair("Draw an engine", [], [],
      { pathways: [spiralPaths[0], spiralPaths[0], spiralPaths[2]], blend: { id: "blend" } }), true);
  });
  check("User-selected blend is not replaced by an automatic three-route expansion", () => {
    const evidence = [JSON.stringify({ source: "ASCENSION_BLEND", action: "blend" })];
    assert.equal(deliveryEngine.needsSpiralExpansionRepair("Design a propulsion engine", evidence, [],
      { pathways: spiralPaths.slice(0, 1), blend: null }), false);
  });
  check("NEW ANSWERS requests materially new routes for an ordinary question", () => {
    const evidence = [JSON.stringify({ source: "ASCENSION_REVISION", action: "new_answers" })];
    assert.equal(deliveryEngine.needsSpiralExpansionRepair("How do magnets work?", evidence, [],
      { pathways: spiralPaths.slice(0, 1), blend: null }), true);
  });
  check("Simple factual answers do not invent multiple pathways", () => {
    assert.equal(deliveryEngine.needsSpiralExpansionRepair("What is two plus two?", [], [],
      { pathways: [], blend: null }), false);
  });
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
  const formerAllow = process.env.ASCENSION_ALLOW_OPENAI_AI;
  const formerPaid = process.env.ASCENSION_ENABLE_PAID_APIS;
  const formerKey = process.env.OPENAI_API_KEY;
  delete process.env.ASCENSION_ALLOW_OPENAI_AI;
  delete process.env.ASCENSION_ENABLE_PAID_APIS;
  delete process.env.OPENAI_API_KEY;
  try {
    const waiting = await deliveryEngine.resolveDelivery({
      run: runShoe, artifactStage: null, draft: null,
      store: noStore, retry: false,
    });
    check("unconfigured external drafting waits for the governed runtime", () => {
      assert.equal(waiting.status, "running");
      assert.equal(waiting.source, null);
      assert.equal(waiting.response_payload, null);
      assert.equal(waiting.error, null);
    });
    const delivered = await deliveryEngine.resolveDelivery({
      run: runShoe, artifactStage: null,
      draft: {
        status: "completed", source_key: `local:${runShoe.id}`,
        created_at: "2026-09-28T13:06:08Z", response_payload: draftAnswer,
        error: null, engine_model: "owner-authored-model",
      }, store: noStore, retry: false,
    });
    check("a recorded local model draft remains readable without outside services", () => {
      assert.equal(delivered.status, "completed");
      assert.equal(delivered.source, "external_draft");
      assert.match(delivered.response_payload.body, /heel pod/);
    });
  } finally {
    if (formerAllow === undefined) delete process.env.ASCENSION_ALLOW_OPENAI_AI;
    else process.env.ASCENSION_ALLOW_OPENAI_AI = formerAllow;
    if (formerPaid === undefined) delete process.env.ASCENSION_ENABLE_PAID_APIS;
    else process.env.ASCENSION_ENABLE_PAID_APIS = formerPaid;
    if (formerKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = formerKey;
  }
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
  // No unapproved external application may be contacted for inference.
  const originalFetch = globalThis.fetch;
  const originalPaid = process.env.ASCENSION_ENABLE_PAID_APIS;
  const originalAllow = process.env.ASCENSION_ALLOW_OPENAI_AI;
  const originalApiKey = process.env.OPENAI_API_KEY;
  try {
    delete process.env.ASCENSION_ENABLE_PAID_APIS;
    delete process.env.ASCENSION_ALLOW_OPENAI_AI;
    delete process.env.OPENAI_API_KEY;
    let externalCalls = 0;
    globalThis.fetch = async () => { externalCalls++; throw new Error("Unexpected external call"); };
    await assert.rejects(
      () => callApprovedAnswer({ system: "test", user: "test", includeInternalKnowledge: false }),
      /No owner-approved external draft provider enabled/
    );
    check("unapproved providers cannot consume user objectives", () => {
      assert.equal(externalCalls, 0);
    });
    process.env.ASCENSION_ENABLE_PAID_APIS = "true";
    process.env.ASCENSION_ALLOW_OPENAI_AI = "true";
    process.env.OPENAI_API_KEY = "test-only";
    globalThis.fetch = async (url) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      return new Response(JSON.stringify({
        status: "completed",
        output: [{type: "message", content: [{type: "output_text",text: '{"meaning_elements":[],"notes":"test"}'}]}],
      }), {status:200,headers:{"content-type":"application/json"}});
    };
    const result = await callApprovedAnswer({
      system: "test", user: "test", includeInternalKnowledge: false,
    });
    check("double owner opt-in is required for the approved answer path", () => {
      assert.deepEqual(result.json.meaning_elements, []);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPaid === undefined) delete process.env.ASCENSION_ENABLE_PAID_APIS;
    else process.env.ASCENSION_ENABLE_PAID_APIS = originalPaid;
    if (originalAllow === undefined) delete process.env.ASCENSION_ALLOW_OPENAI_AI;
    else process.env.ASCENSION_ALLOW_OPENAI_AI = originalAllow;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
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

