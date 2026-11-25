import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modelJobTransition } from "../src/lib/ascension/data/model-job-safety.mjs";

assert.equal(modelJobTransition("queued", "running"), "conflict");
assert.equal(modelJobTransition("claimed", "running"), "updated");
assert.equal(modelJobTransition("running", "completed"), "updated");
assert.equal(modelJobTransition("running", "failed"), "updated");
assert.equal(modelJobTransition("claimed", "completed"), "updated");
assert.equal(modelJobTransition("completed", "completed"), "replayed");
assert.equal(modelJobTransition("failed", "failed"), "replayed");
assert.equal(modelJobTransition("completed", "failed"), "conflict");
assert.equal(modelJobTransition("failed", "completed"), "conflict");
assert.equal(modelJobTransition("completed", "running"), "conflict");
assert.equal(modelJobTransition(undefined, "completed"), "conflict");

const queue = readFileSync("src/routes/api/public/ascension/model-queue.ts","utf8");
const guards = [...queue.matchAll(/\.in\("status", \["claimed", "running"\]\)/g)];
assert.ok(guards.length >= 3, "Every running/failed/completed update must be conditional");
assert.match(queue, /modelJobTransition\(job\.status, status\)/);
assert.match(queue, /if \(transition === "replayed"\)/);
assert.match(queue, /error: "model_status_changed"/);

const knowledge = readFileSync("src/lib/ascension/engine/knowledge.server.ts","utf8");
assert.doesNotMatch(knowledge, /\/verified_delta\|ledger\|evidence\|transition\/\.test\(key\)/,
  "Stored word labels are not runtime verification evidence");
console.log("PASS: 3D model status is terminally immutable; knowledge labels cannot forge verification");
