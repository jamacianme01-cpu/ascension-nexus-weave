import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { callAscensionAnswer, localBrainConfigured } from "../src/lib/ascension/engine/local-answer.server.ts";

const priorBase = process.env.LOCAL_LLM_BASE_URL;
const priorModel = process.env.LOCAL_LLM_MODEL;
const previousFetch = globalThis.fetch;
try {
  process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:11434/v1";
  process.env.LOCAL_LLM_MODEL = "qwen3:4b";
  assert.equal(localBrainConfigured(), true);
  let calls = 0;
  globalThis.fetch = async (url, request) => {
    calls++;
    assert.equal(String(url), "http://127.0.0.1:11434/api/chat",
      "The answer request must stay on the current computer's loopback service");
    assert.equal(request.method, "POST");
    const body = JSON.parse(request.body);
    assert.equal(body.model, "qwen3:4b");
    assert.equal(body.stream, true, "Structured pathways must stream to avoid 30-second idle timeouts");
    assert.equal(body.think, false);
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[1].content, "Create a worker drone");
    assert.deepEqual(body.format, { type: "object", properties: { pathways: { type: "array" } } });
    return new Response([
      JSON.stringify({done:false,message:{role:"assistant",content:'{"pathways"'}}),
      JSON.stringify({done:true,done_reason:"stop",message:{role:"assistant",content:':[]}'}}),
    ].join("\n") + "\n",{status:200,headers:{"content-type":"application/x-ndjson"}});
  };
  const answer = await callAscensionAnswer({
    system: "Develop the invention",
    user: "Create a worker drone",
    structuredOutput: {
      name: "ascension_pathways",
      schema: { type: "object", properties: { pathways: { type: "array" } } },
    },
  });
  assert.equal(answer.text, '{"pathways":[]}');
  assert.equal(answer.model, "local:qwen3:4b");
  assert.deepEqual(answer.sources, []);
  assert.equal(calls, 1);

  process.env.LOCAL_LLM_BASE_URL = "http://192.168.0.87:11434/v1";
  await assert.rejects(
    callAscensionAnswer({ system: "Test", user: "Create a worker drone" }),
    /loopback-only/,
    "Do not split inference to another computer",
  );
  assert.equal(calls, 1, "An unapproved remote address must never receive an inference request");

  process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:11434/v1";
  globalThis.fetch = async () => new Response(JSON.stringify({
    done:true, message:{role:"assistant",content:""},
  }),{status:200});
  await assert.rejects(
    callAscensionAnswer({ system: "Test", user: "Create a worker drone" }),
    /no completed answer/,
    "Empty local output is not a successful answer",
  );
  const route = readFileSync("src/routes/api/public/ascension/independent.ts", "utf8");
  assert.match(route,/callAscensionAnswer\(\{/,"V1 must use the ASCENSION local brain adapter");
  assert.match(route, /beginLocalPathways\(objective, prior\)/,
    "Local pathways must run beyond the request lifecycle with polling");
  const worker = readFileSync("scripts/brain-worker.mjs", "utf8");
  assert.match(worker, /local_brain_job/,
    "Old computer must poll local pathway jobs instead of timing out HTTP");
  assert.match(route,/Local ASCENSION brain/,"Provenance must identify local rather than cloud inference");
  console.log("PASS ASCENSION local-brain boundary: loopback model, structured output, identity provenance and no remote-PC inference.");
} finally {
  globalThis.fetch = previousFetch;
  if (priorBase === undefined) delete process.env.LOCAL_LLM_BASE_URL;
  else process.env.LOCAL_LLM_BASE_URL = priorBase;
  if (priorModel === undefined) delete process.env.LOCAL_LLM_MODEL;
  else process.env.LOCAL_LLM_MODEL = priorModel;
}
