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
} finally {
  delete globalThis.__modelJobTestDatabase;
  await server.close();
}
