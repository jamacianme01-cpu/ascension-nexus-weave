import assert from "node:assert/strict";
import { loadServerEnvironment, connectAnswerEngine } from "../scripts/dev-local.mjs";

const env = {};
loadServerEnvironment(env, {
  DATABASE_URL: "postgres://owner:example@localhost:5432/ascension",
  ASCENSION_STORAGE_DIR: "/data/ascension/storage",
  ASCENSION_ENABLE_PAID_APIS: "false",
  ZAI_API_KEY: "must-not-be-loaded",
  SUPABASE_URL: "must-not-be-loaded",
  LOVABLE_API_KEY: "must-not-be-loaded",
});
assert.equal(env.DATABASE_URL, "postgres://owner:example@localhost:5432/ascension");
assert.equal(env.ASCENSION_STORAGE_DIR, "/data/ascension/storage");
assert.equal("ZAI_API_KEY" in env, false);
assert.equal("SUPABASE_URL" in env, false);
assert.equal("LOVABLE_API_KEY" in env, false);
assert.match(await connectAnswerEngine(env), /governed runtime/);
assert.equal(await connectAnswerEngine({
  ASCENSION_ENABLE_PAID_APIS: "true",
  ASCENSION_ALLOW_OPENAI_AI: "true",
  OPENAI_API_KEY: "test-only",
}), "owner-approved OpenAI");
assert.match(await connectAnswerEngine({ LOCAL_LLM_BASE_URL: "http://127.0.0.1:11434/v1" }), /governed runtime/);
console.log("PASS independent launcher never starts or selects unauthorized apps or the old PC");
