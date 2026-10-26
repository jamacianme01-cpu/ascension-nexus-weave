import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } },
});
const oldFetch = globalThis.fetch;
const previous = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  ASCENSION_EXTERNAL_KNOWLEDGE_ENABLED: process.env.ASCENSION_EXTERNAL_KNOWLEDGE_ENABLED,
  ASCENSION_ALLOW_LOVABLE_AI: process.env.ASCENSION_ALLOW_LOVABLE_AI,
};
let passed = 0;
function ok(label) {
  passed++;
  process.stdout.write(`PASS ${label}\n`);
}
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
const wiki = {
  pages: [
    { key: "Piezoelectricity", title: "Piezoelectricity",
      excerpt: "Electric charge in <span class=\"searchmatch\">piezoelectric</span> materials." },
    { key: "Electric_charge", title: "Electric charge", description: "Electric charge basics" },
  ],
};
const crossref = {
  message: { items: [
    { DOI: "10.1234/example.2024", title: ["Piezoelectric materials: a review"],
      "container-title": ["Materials Journal"], published: { "date-parts": [[2024, 5, 10]] } },
    { DOI: "not-a-doi", title: ["Invalid entry"] },
  ] },
};
const fetched = [];
const mockSearch = async (url) => {
  fetched.push(String(url));
  if (String(url).startsWith("https://en.wikipedia.org/w/rest.php/v1/search/page?")) return json(wiki);
  if (String(url).startsWith("https://api.crossref.org/works?")) return json(crossref);
  throw new Error("unexpected network endpoint: " + url);
};
try {
  const external = await server.ssrLoadModule(
    "/src/lib/ascension/engine/external-knowledge.server.ts");
  const result = await external.retrieveExternalKnowledge("piezoelectric ceramics", 6, mockSearch);
  assert.equal(result.evidence.length, 3);
  assert.deepEqual(result.evidence.map(e => e.id), ["E1", "E2", "E3"]);
  assert.equal(result.evidence[0].url, "https://en.wikipedia.org/wiki/Piezoelectricity");
  assert.equal(result.evidence[2].url, "https://doi.org/10.1234/example.2024");
  assert.equal(result.evidence[2].published_at, "2024");
  assert.ok(result.evidence.every(e => e.provenance_status === "external_unverified"));
  assert.ok(result.evidence.every(e => e.url.startsWith("https://")));
  assert.ok(result.evidence[0].snippet.includes("piezoelectric"));
  assert.ok(!result.evidence[0].snippet.includes("<span"));
  assert.equal(result.errors.length, 0);
  ok("real-source adapters normalize citations, DOI, publication year and provenance");

  const failure = await external.retrieveExternalKnowledge("ceramics", 6, async (url) => {
    if (String(url).includes("wikipedia.org")) return json({}, 503);
    return json(crossref);
  });
  assert.deepEqual(failure.evidence.map(e => e.source), ["crossref"]);
  assert.equal(failure.evidence[0].id, "E1");
  assert.match(failure.errors[0], /wikipedia: HTTP 503/);
  ok("provider outage retains only returned sources and reports failure");

  assert.equal(external.removeUnsupportedExternalCitations(
    "Supported [E1], invented [E66] and repeated [E1].", result),
    "Supported [E1], invented  and repeated [E1].");
  assert.match(external.formatExternalSourceList(result), /https:\/\/doi.org\/10.1234\/example.2024/);
  assert.doesNotMatch(external.formatExternalSourceList(
    { ...result, evidence: [] }), /https:\/\//);
  ok("source appendix is deterministic and fabricated model markers are removed");

  // End-to-end transport contract: objective knowledge query -> public source
  // adapters -> existing callZai answer provider. No governed status changes.
  process.env.OPENROUTER_API_KEY = "retrieval-test-only";
  process.env.ASCENSION_EXTERNAL_KNOWLEDGE_ENABLED = "true";
  delete process.env.ASCENSION_ALLOW_LOVABLE_AI;
  const { callZai } = await server.ssrLoadModule(
    "/src/lib/ascension/engine/zai.server.ts");
  let sentModelPrompt = "";
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.openrouter.ai/")) throw Error("wrong endpoint");
    if (String(url).startsWith("https://openrouter.ai/api/v1/chat/completions")) {
      const body = JSON.parse(String(init.body));
      sentModelPrompt = body.messages[1].content;
      assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0 });
      return new Response(
        'data: ' + JSON.stringify({ choices: [{ delta: {
          content: "Piezoelectric materials produce charge under mechanical stress [E1]." } }] }) +
          "\n\ndata: [DONE]\n\n");
    }
    return mockSearch(url);
  };
  const answer = await callZai({
    system: "Provide three different technical pathways. External results are unverified.",
    user: "Design an experimental energy harvester.",
    knowledgeQuery: "piezoelectric ceramics",
  });
  assert.equal(answer.externalKnowledge.evidence.length, 3);
  assert.equal(answer.externalKnowledge.query, "piezoelectric ceramics");
  assert.match(sentModelPrompt, /Piezoelectricity/);
  assert.match(sentModelPrompt, /https:\/\/en.wikipedia.org\/wiki\/Piezoelectricity/);
  assert.match(sentModelPrompt, /EXTERNAL REFERENCE EXCERPTS/);
  assert.match(answer.text, /\[E1\]/);
  assert.equal(answer.model, "openrouter/free");
  ok("end-to-end source retrieval supplies existing hosted answer without pretending core execution");

  process.env.ASCENSION_EXTERNAL_KNOWLEDGE_ENABLED = "false";
  const before = fetched.length;
  await callZai({
    system: "No lookup.",
    user: "Return a result.",
    knowledgeQuery: "sensitive private objective text",
    includeInternalKnowledge: false,
  });
  assert.equal(fetched.length, before);
  ok("internal-knowledge-disabled calls skip all external search providers");
  process.stdout.write(`${passed} source-attributed retrieval checks passed\n`);
} finally {
  globalThis.fetch = oldFetch;
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await server.close();
}
