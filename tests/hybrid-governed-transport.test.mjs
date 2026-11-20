import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Execute the actual TypeScript bridge without accessing the network or secrets.
const source = readFileSync(fileURLToPath(new URL(
  "../src/lib/ascension/data/volume-transport.server.ts", import.meta.url)), "utf8");
assert.doesNotMatch(source, /api\.machines\.dev|ensureWorkerAwake|FLY_API_TOKEN|ASCENSION_FLY_MACHINE_TOKEN/);
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { callOwnerVolumeTransport } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const originalFetch = globalThis.fetch;
const originalEnv = {
  ASCENSION_VOLUME_TRANSPORT_URL: process.env.ASCENSION_VOLUME_TRANSPORT_URL,
  ASCENSION_PUBLISH_TOKEN: process.env.ASCENSION_PUBLISH_TOKEN,
  FLY_APP_NAME: process.env.FLY_APP_NAME,
};
const calls = [];
try {
  process.env.ASCENSION_PUBLISH_TOKEN = "offline-test-only";
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), token: init.headers["X-Ascension-Publish-Token"] });
    return new Response(JSON.stringify({
      status: "LIVE_GOVERNED_TRANSPORT",
      original_publication_revision_at_start: 126,
    }), { status: 200 });
  };

  process.env.ASCENSION_VOLUME_TRANSPORT_URL = "http://127.0.0.1:9091";
  const local = await callOwnerVolumeTransport("/health", "GET");
  assert.equal(local.status, "LIVE_GOVERNED_TRANSPORT");
  assert.deepEqual(calls.map(c => c.url), ["http://127.0.0.1:9091/health"]);
  assert.equal(calls[0].token, "offline-test-only");

  calls.length = 0;
  process.env.ASCENSION_VOLUME_TRANSPORT_URL = "https://owner-private-tunnel.example";
  const remote = await callOwnerVolumeTransport("/health", "GET");
  assert.equal(remote.status, "LIVE_GOVERNED_TRANSPORT");
  assert.deepEqual(calls.map(c => c.url), ["https://owner-private-tunnel.example/health"]);

  // Existing private 6PN bridge is accepted only on its exact original
  // website host, with its fixed internal process host and port.
  calls.length = 0;
  process.env.FLY_APP_NAME = "ascension-nexus-weave";
  process.env.ASCENSION_VOLUME_TRANSPORT_URL = "http://worker.process.ascension-nexus-weave.internal:9091";
  const bridge = await callOwnerVolumeTransport("/health", "GET");
  assert.equal(bridge.status, "LIVE_GOVERNED_TRANSPORT");
  assert.deepEqual(calls.map(c => c.url), ["http://worker.process.ascension-nexus-weave.internal:9091/health"]);
  assert.equal(calls[0].token, "offline-test-only");

  // Never permit that private host outside the original process.
  calls.length = 0;
  delete process.env.FLY_APP_NAME;
  await assert.rejects(callOwnerVolumeTransport("/health", "GET"));
  assert.equal(calls.length, 0);

  for (const forbidden of [
    "http://owner-private-tunnel.example:9091",
    "http://192.168.1.10:9091",
    "http://worker.process.ascension-nexus-weave.internal:9092",
    "http://other.internal:9091",
    "https://ascension-nexus-weave.fly.dev",
    "https://username:password@owner-private-tunnel.example",
    "ftp://owner-private-tunnel.example",
  ]) {
    calls.length = 0;
    process.env.ASCENSION_VOLUME_TRANSPORT_URL = forbidden;
    await assert.rejects(callOwnerVolumeTransport("/health", "GET"));
    assert.equal(calls.length, 0, `Do not send token or call network for ${forbidden}`);
  }

  calls.length = 0;
  process.env.ASCENSION_VOLUME_TRANSPORT_URL = "https://owner-private-tunnel.example";
  await assert.rejects(callOwnerVolumeTransport("//other-host/health", "GET"),
    /Invalid private ASCENSION transport path/);
  assert.equal(calls.length, 0);

  console.log("PASS: owner Oracle/local TLS, original private 6PN bridge, host-bound credentials, no public plaintext.");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
