import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { callAscensionAnswer, localBrainConfigured } from "../src/lib/ascension/engine/local-answer.server.ts";
import { asCompletedDesignStep } from "../src/lib/ascension/design-answer.ts";

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

  // The spoken Tree is short; the full pathway answer retains its larger
  // token budget, and source steps never acquire fabricated "completed" work.
  globalThis.fetch = async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.stream, false);
    assert.equal(body.options.num_predict, 180);
    return new Response(JSON.stringify({
      done: true, done_reason: "stop",
      message: { role: "assistant", content: "The base carries the drive motors." },
    }), { status: 200 });
  };
  const guide = await callAscensionAnswer({
    system: "Explain the part", user: "How does it work?",
    maxPredict: 180, timeoutMs: 45000,
  });
  assert.match(guide.text, /drive motors/);
  assert.equal(asCompletedDesignStep("1. The rotor sits above the frame."), "The rotor sits above the frame.");
  assert.equal(asCompletedDesignStep("Choose a material"), "Choose a material",
    "Never pretend an unfinished engineering choice was made.");
  const workerSource = readFileSync("scripts/brain-worker.mjs", "utf8");
  assert.match(workerSource, /const MAX_PARALLEL = 2/,
    "Image requests must not block the Tree behind a single synchronous worker.");
  const screenSource = readFileSync("src/components/ascension/independent-engage.tsx", "utf8");
  assert.doesNotMatch(screenSource, /if \(choice !== null && experience === "design" && !designSettled\) return/,
    "Selected pathway must open immediately, even while its real picture loads.");
  assert.match(screenSource, /local_brain_job_id\?: string/,
    "Skytech must recognize asynchronous local pathway IDs.");
  assert.match(screenSource, /localJob \? "local_brain_job" : "brain_job"/,
    "Skytech must poll local jobs while Railway continues polling cloud-relayed jobs.");

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

  assert.match(route, /localPathwaySerial\.then\(\(\) => build\(objective, prior\)\)/,
    "Old computer must serialize expensive structured Ollama generation.");
  assert.match(route, /ascension-v1-cpu-job-lifecycle-20261106/,
    "Local server must expose a new runtime signature for this repair.");
  const relay = readFileSync("src/lib/ascension/brain-relay.server.ts", "utf8");
  assert.match(relay, /BROWSER_JOB_TIMEOUT = 20 \* 60_000/,
    "Railway must not delete a genuine old-CPU job at nine minutes.");
  assert.match(worker, /for \(let i = 0; i < 570; i\+\+\)/,
    "The old-PC worker must retain results until before the cloud deadline.");
  assert.match(screenSource, /for \(let attempt = 0; attempt < 600; attempt\+\+\)/,
    "The browser must not stop polling a still-valid pathway job after ten minutes.");

  assert.match(route,/Local ASCENSION brain/,"Provenance must identify local rather than cloud inference");
  console.log("PASS ASCENSION local-brain boundary: loopback model, structured output, identity provenance and no remote-PC inference.");
} finally {
  globalThis.fetch = previousFetch;
  if (priorBase === undefined) delete process.env.LOCAL_LLM_BASE_URL;
  else process.env.LOCAL_LLM_BASE_URL = priorBase;
  if (priorModel === undefined) delete process.env.LOCAL_LLM_MODEL;
  else process.env.LOCAL_LLM_MODEL = priorModel;
}
