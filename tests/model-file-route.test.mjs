import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modelUploadSignature } from "../src/lib/ascension/data/model-storage-signature.mjs";

// Exercise the actual model-file route with an isolated in-memory claim and
// temporary owner folder. No database server, no paid API, no 3D engine.
const root = mkdtempSync(join(tmpdir(), "ascension-signed-glb-"));
const keys = ["ASCENSION_STORAGE_DIR", "ASCENSION_PUBLISH_TOKEN", "ASCENSION_PUBLIC_BASE_URL"];
const originals = Object.fromEntries(keys.map(k => [k, process.env[k]]));
const jobId = "a27bc9d2-2f4e-4b87-963a-e41b63ee3d91";
const requestId = "bab3bb81-55de-45c7-9639-03c4370356fb";
const objectPath = "ascension-models/" + requestId + "/" + jobId + ".glb";
const secret = "t".repeat(96);
const target = join(root, objectPath);
process.env.ASCENSION_STORAGE_DIR = root;
process.env.ASCENSION_PUBLISH_TOKEN = secret;
process.env.ASCENSION_PUBLIC_BASE_URL = "https://owner.example.invalid";
let jobStatus = "claimed";
globalThis.__ascensionModelTestDb = {
  from() {
    return {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        return { data: { request_id: requestId, status: jobStatus }, error: null };
      },
    };
  },
  storage: {
    from() {
      return {
        async upload(rel, bytes) {
          const file = join(root, "ascension-models", rel);
          mkdirSync(resolve(file, ".."), { recursive: true });
          writeFileSync(file, bytes);
          return { error: null };
        },
      };
    },
  },
};
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } },
  plugins: [{
    name: "owner-model-file-test-storage",
    enforce: "pre",
    load(id) {
      if (id.endsWith("/lib/ascension/data/client.server.ts"))
        return "export const ascensionDb = globalThis.__ascensionModelTestDb;";
    },
  }],
});

try {
  const { Route } = await server.ssrLoadModule(
    "/src/routes/api/public/ascension/model-file.ts");
  const handlers = Route.options.server.handlers;
  const expires = Date.now() + 60_000;
  const signature = modelUploadSignature(objectPath, expires, secret);
  const makeUrl = (sig = signature, object = objectPath) =>
    "https://owner.example.invalid/api/public/ascension/model-file?path=" +
    encodeURIComponent(object) + "&expires=" + expires + "&signature=" + sig;

  // A valid, minimal GLB container: glTF v2 + one four-byte JSON chunk.
  const glb = Buffer.alloc(24);
  glb.write("glTF", 0, "ascii");
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(24, 8);
  glb.writeUInt32LE(4, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  glb.write("{}  ", 20, "ascii");
  assert.equal((await handlers.PUT({request:new Request(makeUrl("0".repeat(64)),{
    method:"PUT",body:glb})})).status, 403);
  assert.equal((await handlers.PUT({request:new Request(makeUrl(),{
    method:"PUT",body:Buffer.from("not-a-model")})})).status, 422);
  assert.equal((await handlers.PUT({request:new Request(makeUrl(),{
    method:"PUT",body:glb})})).status, 200);
  assert.deepEqual(readFileSync(target), glb);

  const fetched = await handlers.GET({request:new Request(makeUrl())});
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get("content-type"), "model/gltf-binary");
  assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), glb);

  jobStatus = "completed";
  assert.equal((await handlers.PUT({request:new Request(makeUrl(),{
    method:"PUT",body:glb})})).status, 409);
  assert.equal((await handlers.GET({request:new Request(
    makeUrl(signature, "ascension-models/../owner-secret.glb"))})).status, 400);
  console.log("PASS: actual owner storage endpoint accepts signed GLB, serves identical bytes, rejects bad signatures, forged model data, terminal reuploads and traversal");
} finally {
  await server.close();
  delete globalThis.__ascensionModelTestDb;
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
}
