import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";

// Isolated queue projection tests. These are not evidence of live generation.
const rows = [];
let writes = 0;
const database = {
  from() {
    const query = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      then(accept) {
        return Promise.resolve({ data: rows, error: null }).then(accept);
      },
      async upsert(incoming) {
        writes++;
        for (const row of incoming) {
          if (!rows.some((existing) => existing.pathway_id === row.pathway_id)) rows.push(row);
        }
        return { error: null };
      },
    };
    return query;
  },
};
globalThis.__modelJobTestDatabase = database;
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } },
  plugins: [
    {
      name: "isolated-model-database",
      enforce: "pre",
      load(id) {
        if (id.endsWith("/integrations/supabase/client.server.ts"))
          return "export const supabaseAdmin = globalThis.__modelJobTestDatabase;";
      },
    },
  ],
});
try {
  // A configured gateway key is NOT permission to spend credits on images.
  const { imageProvider, generateConceptImage } = await server.ssrLoadModule(
    "/src/lib/ascension/engine/image.server.ts",
  );
  const priorKey = process.env.LOVABLE_API_KEY;
  const priorOptIn = process.env.ASCENSION_ALLOW_PAID_IMAGES;
  const originalFetch = globalThis.fetch;
  try {
    process.env.LOVABLE_API_KEY = "test-only";
    delete process.env.ASCENSION_ALLOW_PAID_IMAGES;
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("No image API should be contacted"); };
    assert.equal(imageProvider(), null);
    await assert.rejects(generateConceptImage("test preview", "assembled/example.png"), /disabled/);
    assert.equal(calls, 0);
    process.env.ASCENSION_ALLOW_PAID_IMAGES = "true";
    assert.equal(imageProvider()?.provider, "lovable");
  } finally {
    globalThis.fetch = originalFetch;
    if (priorKey === undefined) delete process.env.LOVABLE_API_KEY;
    else process.env.LOVABLE_API_KEY = priorKey;
    if (priorOptIn === undefined) delete process.env.ASCENSION_ALLOW_PAID_IMAGES;
    else process.env.ASCENSION_ALLOW_PAID_IMAGES = priorOptIn;
  }
  console.log("PASS no implicit paid image API calls on default pathway flow");
  const { enqueueDeliveryModels, attachCompletedModels } = await server.ssrLoadModule(
    "/src/lib/ascension/model-jobs.server.ts",
  );
  const { parseDelivery } = await server.ssrLoadModule("/src/lib/ascension/result-model.ts");
  const delivery = parseDelivery({
    kind: "answer",
    title: "Design",
    body: "A folding workbench uses a hinged top and locking legs.",
    files: [],
    limitations: [],
    pathways: [
      {
        id: "folding",
        label: "Folding workbench",
        summary: "Hinged top and locking legs save storage space.",
        steps: ["Size the top"],
        tradeoffs: [],
      },
    ],
  });
  await enqueueDeliveryModels("request", delivery, "Design a folding workbench");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_image_url, null);
  assert.equal(rows[0].status, "queued");
  console.log("PASS design queues without waiting for a reference image");
  await enqueueDeliveryModels("drawing-request", { ...delivery, pathways: [{ ...delivery.pathways[0], id: "drawing-path" }] }, "draw a folding workbench");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].request_id, "drawing-request");
  assert.equal(rows[1].status, "queued");
  assert.equal(rows[1].source_image_url, null);
  console.log("PASS drawing request queues Hunyuan before a visual artifact exists");
  rows[0].status = "running";
  await enqueueDeliveryModels("request", delivery, "Design a folding workbench");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, "running");
  console.log("PASS repeated answer reads preserve the existing model job");
  const before = writes;
  await enqueueDeliveryModels("question", delivery, "What is two plus two?");
  assert.equal(writes, before);
  console.log("PASS ordinary answers do not enqueue 3D work");
  rows[0].status = "failed";
  rows[0].error = "Reference image provider returned HTTP 503";
  rows[0].model_url = "https://example.invalid/stale.glb";
  let result = parseDelivery(await attachCompletedModels("request", delivery));
  assert.equal(result.pathways[0].model_status, "failed");
  assert.equal(result.pathways[0].model_error, rows[0].error);
  assert.equal(result.pathways[0].model_url, null);
  console.log("PASS failed jobs preserve the answer and expose the recorded error");
  rows[0].status = "completed";
  rows[0].error = null;
  result = parseDelivery(await attachCompletedModels("request", delivery));
  assert.equal(result.pathways[0].model_url, rows[0].model_url);
  console.log("PASS only completed jobs attach their model URL");
  // The reference image shown in the viewer MUST be exactly the image URL
  // attached to this job. A separately generated picture has no such provenance.
  rows[0].source_image_url = "https://example.invalid/pathway-source.png";
  result = parseDelivery(await attachCompletedModels("request", delivery));
  assert.equal(result.pathways[0].generated_image_url, rows[0].source_image_url);
  assert.equal(result.pathways[0].model_url, rows[0].model_url);
  console.log("PASS one source-image URL is shared by the viewer and completed GLB");

} finally {
  delete globalThis.__modelJobTestDatabase;
  await server.close();
}
