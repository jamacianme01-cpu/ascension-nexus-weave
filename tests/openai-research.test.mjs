import assert from "node:assert/strict";
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
  process.stdout.write("PASS " + name + "\n");
}
try {
  const { extractOpenAIWebSources } = await server.ssrLoadModule(
    "/src/lib/ascension/engine/openai.server.ts",
  );
  const { parseDelivery } = await server.ssrLoadModule(
    "/src/lib/ascension/result-model.ts",
  );
  const sources = extractOpenAIWebSources({
    output: [
      { type: "web_search_call", action: { sources: [
        { title: "Consulted", url: "https://example.org/consulted" },
      ] } },
      { type: "message", content: [
        { type: "output_text", text: "Result", annotations: [
          { type: "url_citation", title: "Cited first", url: "https://example.org/cited",
            start_index: 0, end_index: 6 },
          { type: "url_citation", title: "Bad URL", url: "javascript:alert(1)" },
        ] },
      ] },
    ],
  });
  check("only real search annotations and consulted sources are exposed", () => {
    assert.equal(sources.length, 2);
    assert.equal(sources[0].title, "Cited first");
    assert.equal(sources[1].title, "Consulted");
    assert.equal(sources.some((source) => !source.url.startsWith("https://")), false);
  });
  check("text or fabricated references alone do not count as citations", () => {
    assert.deepEqual(extractOpenAIWebSources({
      output: [{ type: "message", content: [{ type: "output_text",
        text: "Source: https://example.org/not-tool-verified" }] }],
    }), []);
  });
  check("delivery preserves HTTPS research citations but never grants verification", () => {
    const delivery = parseDelivery({
      kind: "answer",
      title: "Make worker drones",
      body: "An unverified concept draft.",
      pathways: [], blend: null, files: [], limitations: [],
      web_sources: [
        { title: "Cited", url: "https://example.org/cited" },
        { title: "Unsafe", url: "javascript:alert(1)" },
      ],
    });
    assert.deepEqual(delivery.web_sources, [{ title: "Cited", url: "https://example.org/cited" }]);
    assert.equal(delivery.objective_fit, undefined);
  });
  const { callZai, zaiModel } = await server.ssrLoadModule(
    "/src/lib/ascension/engine/zai.server.ts",
  );
  const deliveryEngine = await server.ssrLoadModule(
    "/src/lib/ascension/engine/delivery.server.ts",
  );
  const names = [
    "OPENAI_API_KEY", "ASCENSION_ALLOW_OPENAI_AI", "OPENROUTER_API_KEY",
    "ZAI_API_KEY", "LOVABLE_API_KEY", "ASCENSION_ALLOW_LOVABLE_AI",
    "LOCAL_LLM_BASE_URL",
  ];
  const originals = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const name of names) delete process.env[name];
    process.env.OPENAI_API_KEY = "sk-test-only-do-not-use";
    process.env.ASCENSION_ALLOW_OPENAI_AI = "true";
    globalThis.fetch = async (url, opts) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(JSON.parse(opts.body).tools, undefined);
      return new Response(JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [
          { type: "output_text", text: '{"meaning_elements":[],"notes":"test"}' },
        ] }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await callZai({
      system: "Test", user: "make worker drones", includeInternalKnowledge: false,
    });
    check("OpenAI can serve existing ASCENSION inference without a separate Z.AI key", () => {
      assert.ok(zaiModel().startsWith("gpt-"));
      assert.deepEqual(result.json?.meaning_elements, []);
    });
    process.env.ZAI_API_KEY = "test-stale-zai-key";
    const stillOpenAI = await callZai({
      system: "Test", user: "make worker drones", includeInternalKnowledge: false,
    });
    check("explicit OpenAI opt-in takes priority over a leftover Z.AI key", () => {
      assert.equal(stillOpenAI.model, zaiModel());
      assert.ok(stillOpenAI.model.startsWith("gpt-"));
    });
    const run = {
      id: "00000000-0000-4000-8000-000000000001",
      objective: "make worker drones",
      status: "running", engine: "governed_runtime", result: null,
      evidence: null, constraints: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    let saved = null;
    const recovered = await deliveryEngine.resolveDelivery({
      run, artifactStage: null, draft: null, retry: false,
      store: {
        claim: async () => true,
        complete: async (_key, value) => { saved = value; },
        fail: async () => { throw new Error("unexpected failed draft"); },
      },
      generate: async () => { throw new Error("The operation was aborted due to timeout"); },
    });
    const oldFailed = await deliveryEngine.resolveDelivery({
      run, artifactStage: null, retry: false,
      draft: { status: "failed", source_key: deliveryEngine.artifactSourceKey(run.id, []),
        error: 'Z.AI returned HTTP 429: {"error":{"code":"1305"}}',
        created_at: new Date().toISOString(), engine_model: "glm-4.7-flash" },
      store: {
        claim: async () => { throw new Error("should not retry failed row automatically"); },
        complete: async () => { throw new Error("should not write this historical row"); },
        fail: async () => { throw new Error("should not fail this historical row"); },
      },
    });
    check("a recorded Z.AI 429 failure displays honest pathways instead of no result", () => {
      assert.equal(oldFailed.error, null);
      assert.equal(oldFailed.response_payload?.pathways.length, 3);
      assert.ok(oldFailed.response_payload?.blend);
    });
    check("ENGAGE returns a readable three-pathway unverified guide rather than timeout", () => {
      assert.equal(recovered.status, "completed");
      assert.equal(recovered.response_payload?.pathways.length, 3);
      assert.ok(recovered.response_payload?.blend);
      assert.equal(saved, recovered.response_payload);
      assert.ok(recovered.response_payload?.limitations.some(x => x.includes("Unverified")));
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (originals[name] === undefined) delete process.env[name];
      else process.env[name] = originals[name];
    }
  }
} finally {
  await server.close();
}
process.stdout.write("OpenAI research tests passed: " + passed + "\n");
