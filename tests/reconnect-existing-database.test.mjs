import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const read = name => fs.readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("real server transport preserves existing database, never silently creates a new one", () => {
  const adapter = read("src/lib/ascension/data/postgres.server.ts");
  assert.match(adapter, /import postgres from "postgres"/);
  assert.match(adapter, /ASCENSION_DATABASE_URL/);
  assert.match(adapter, /DATABASE_URL/);
  assert.match(adapter, /SELECT to_regclass/);
  assert.match(adapter, /EXISTING_ASCENSION_SCHEMA_INCOMPLETE/);
  assert.match(adapter, /ascension_guest_submit/);
  assert.match(adapter, /async function/);
  assert.doesNotMatch(adapter, /CREATE TABLE|DROP TABLE|TRUNCATE TABLE/i);
});

test("admin table queries and stored functions no longer always return offline", () => {
  const server = read("src/lib/ascension/data/client.server.ts");
  assert.match(server, /new Query\(table\)/);
  assert.match(server, /rpcDatabase\(name, args\)/);
  assert.doesNotMatch(server, /Promise\.resolve\(\{ data: null, error: OFFLINE/);
  const guest = read("src/lib/ascension/guest.functions.ts");
  assert.match(guest, /import\("@\/lib\/ascension\/data\/client\.server"\)/);
  assert.doesNotMatch(guest, /supabase\.rpc\(/);
});

test("health checks existing tables AND guest stored functions", () => {
  const health = read("src/routes/api/health.ts");
  assert.match(health, /databaseConnectivity\(\)/);
  assert.match(health, /status: database.connected \? "ok" : "degraded"/);
  assert.match(health, /"cache-control": "no-store"/);
});

test("the original worker token and queue path are unchanged", () => {
  const queue = read("src/routes/api/public/ascension/execution-queue.ts");
  assert.match(queue, /ASCENSION_PUBLISH_TOKEN/);
  assert.match(queue, /ascension_execution_requests/);
  assert.match(queue, /normalizeQueueClaim/);
});
