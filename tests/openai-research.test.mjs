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
} finally {
  await server.close();
}
process.stdout.write("OpenAI research tests passed: " + passed + "\n");
