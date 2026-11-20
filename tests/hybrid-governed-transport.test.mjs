import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Execute the actual TypeScript transport with its type annotations erased.
// No credentials, live systems or network access are involved in this test.
const source = readFileSync(fileURLToPath(new URL(
  "../src/lib/ascension/data/volume-transport.server.ts", import.meta.url)), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { callOwnerVolumeTransport } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const originalFetch = globalThis.fetch;
const originalEnv = {
  ASCENSION_VOLUME_TRANSPORT_URL: process.env.ASCENSION_VOLUME_TRANSPORT_URL,
  ASCENSION_PUBLISH_TOKEN: process.env.ASCENSION_PUBLISH_TOKEN,
  FLY_API_TOKEN: process.env.FLY_API_TOKEN,
  ASCENSION_FLY_MACHINE_TOKEN: process.env.ASCENSION_FLY_MACHINE_TOKEN,
};
const calls = [];
try {
  process.env.ASCENSION_PUBLISH_TOKEN = "unit-test-only";
  delete process.env.FLY_API_TOKEN;
  delete process.env.ASCENSION_FLY_MACHINE_TOKEN;
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/machines")) return new Response(JSON.stringify([{
      id: "existing-volume-worker", state: "started",
      config: { metadata: { fly_process_group: "worker" },
        mounts: [{ volume: "owner-volume" }] },
    }]), { status: 200 });
    return new Response(JSON.stringify({
      status: "LIVE_GOVERNED_TRANSPORT",
      original_publication_revision_at_start: 124,
    }), { status: 200 });
  };

  process.env.ASCENSION_VOLUME_TRANSPORT_URL = "http://127.0.0.1:9091";
  const local = await callOwnerVolumeTransport("/health", "GET");
  assert.equal(local.status, "LIVE_GOVERNED_TRANSPORT");
  assert.deepEqual(calls, ["http://127.0.0.1:9091/health"],
    "loopback transport must not call Fly Machines API");

  calls.length = 0;
  process.env.ASCENSION_VOLUME_TRANSPORT_URL = "https://owner-private-tunnel.example";
  const hybrid = await callOwnerVolumeTransport("/health", "GET");
  assert.equal(hybrid.status, "LIVE_GOVERNED_TRANSPORT");
  assert.deepEqual(calls, ["https://owner-private-tunnel.example/health"],
    "secured hybrid transport must not call Fly Machines API");

  calls.length = 0;
  process.env.ASCENSION_VOLUME_TRANSPORT_URL = "http://owner-private-tunnel.example:9091";
  await assert.rejects(callOwnerVolumeTransport("/health", "GET"),
    /must use HTTPS/);
  assert.equal(calls.length, 0, "never send publish token over remote plaintext");

  calls.length = 0;
  process.env.ASCENSION_VOLUME_TRANSPORT_URL =
    "http://worker.process.ascension-nexus-weave.internal:9091";
  process.env.ASCENSION_FLY_MACHINE_TOKEN = "unit-test-only";
  const fly = await callOwnerVolumeTransport("/health", "GET");
  assert.equal(fly.status, "LIVE_GOVERNED_TRANSPORT");
  assert.equal(calls.length, 2);
  assert.match(calls[0], /api\.machines\.dev\/v1\/apps\/ascension-nexus-weave\/machines/);
  assert.match(calls[1], /worker\.process\.ascension-nexus-weave\.internal/);
  console.log("PASS owner hybrid transport: local, secure remote, no plaintext, Fly unchanged");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
