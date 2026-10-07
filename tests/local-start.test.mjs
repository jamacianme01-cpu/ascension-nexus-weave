import assert from "node:assert/strict";
import { connectAnswerEngine, loadServerEnvironment } from "../scripts/dev-local.mjs";

const env = {};
loadServerEnvironment(env, {
  LOCAL_LLM_MODEL: "qwen3-ascension:latest",
  VITE_SUPABASE_URL: "https://example.test",
  ZAI_API_KEY: "test-only",
  UNRELATED: "ignored",
});
assert.equal(env.LOCAL_LLM_MODEL, "qwen3-ascension:latest");
assert.equal(env.SUPABASE_URL, "https://example.test");
assert.equal(env.UNRELATED, undefined);
assert.equal("SUPABASE_PUBLISHABLE_KEY" in env, false);
loadServerEnvironment(env, { ZAI_API_KEY: "do-not-overwrite" });
assert.equal(env.ZAI_API_KEY, "test-only");
console.log("PASS local launch loads server configuration without overriding existing values");

const noNetwork = async () => {
  throw new Error("unexpected request");
};
assert.equal(
  await connectAnswerEngine({ LOVABLE_API_KEY: "test-only" }, { request: noNetwork }),
  "configured Lovable AI",
);
await assert.rejects(
  connectAnswerEngine({ ZAI_API_KEY: "test-only" }, { request: noNetwork }),
  /paid drafts are disabled/,
);
console.log("PASS configured hosted provider is preserved and paid opt-in is respected");

let started = 0,
  calls = 0;
const localEnv = {};
await connectAnswerEngine(localEnv, {
  request: async () => {
    if (++calls === 1) throw new Error("offline");
    return Response.json({ models: [{ name: "nomic-embed-text:latest" }, { name: "qwen3:4b" }] });
  },
  start: async () => {
    started++;
  },
  pause: async () => {},
});
assert.equal(started, 1);
assert.equal(localEnv.LOCAL_LLM_MODEL, "qwen3:4b");
assert.equal(localEnv.LOCAL_LLM_BASE_URL, "http://127.0.0.1:11434/v1");
console.log("PASS local engine is restarted and an installed answer model is connected");

await assert.rejects(
  connectAnswerEngine(
    {},
    {
      request: async () => Response.json({ models: [{ name: "nomic-embed-text:latest" }] }),
      start: noNetwork,
      pause: async () => {},
    },
  ),
  /answer model is not installed/,
);
await assert.rejects(
  connectAnswerEngine(
    {},
    {
      request: async () => {
        throw new Error("offline");
      },
      start: async () => {},
      pause: async () => {},
    },
  ),
  /No local answer engine is reachable/,
);
await assert.rejects(
  connectAnswerEngine(
    { LOCAL_LLM_BASE_URL: "http://localhost:11434/v1", LOCAL_LLM_MODEL: "missing" },
    {
      request: async () => Response.json({ data: [{ id: "qwen3:4b" }] }),
    },
  ),
  /not available/,
);
console.log("PASS missing engines and missing models stop launch with a specific error");
