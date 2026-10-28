import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";

const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } } });
try {
  const iteration = await server.ssrLoadModule("/src/lib/ascension/iteration-model.ts");
  const parent = { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", objective: "Make a telescope app" };
  const html = "<!doctype html><html><body><button onclick='this.textContent=1'>Count</button><script>void 0</script></body></html>";
  const result = { title: "Created app", body: "Your draft is ready.", pathways: [], blend: null, files: [{ name: "index.html", content: html }], model_url: "https://example.invalid/private.glb" };
  const carried = JSON.parse(iteration.priorResultContext(parent, result, "refine"));
  assert.equal(carried.prior_result.files[0].content, html);
  assert.equal(carried.prior_result.files[0].content_truncated, false);
  assert.equal(carried.prior_result.files[0].original_characters, html.length);
  assert.equal(carried.prior_result.body, result.body);
  assert.equal(carried.parent_request_id, parent.id);
  assert.equal(carried.requested_action, "refine");
  assert.match(carried.verification, /not verified/);
  assert.match(carried.prior_result.source_file_context, /not executed or verified/);
  assert.doesNotMatch(JSON.stringify(carried), /private\.glb/);
  const large = "x".repeat(50000);
  const clipped = JSON.parse(iteration.priorResultContext(parent, { ...result, files: [{ name: "index.html", content: large }] }, "continue"));
  assert.equal(clipped.prior_result.files[0].content, large.slice(0, 12000));
  assert.equal(clipped.prior_result.files[0].content_truncated, true);
  assert.equal(clipped.prior_result.files[0].original_characters, large.length);
  const escaped = String.fromCharCode(34, 10, 92, 1).repeat(5000);
  const files = Array.from({ length: 10 }, (_, i) => ({ name: `source-${i}.txt`, content: escaped }));
  const boundedText = iteration.priorResultContext(parent, { ...result, body: "b".repeat(18000), files }, "refine");
  assert.ok(boundedText.length <= 54000);
  const bounded = JSON.parse(boundedText).prior_result;
  assert.equal(bounded.source_files_omitted, files.length - bounded.files.length);
  for (const file of bounded.files) {
    assert.equal(file.content, escaped.slice(0, file.content.length));
    assert.equal(file.content_truncated, file.content.length < escaped.length);
  }
  const smallFiles = Array.from({ length: 10 }, (_, i) => ({ name: `source-${i}.txt`, content: `source ${i}` }));
  const capped = JSON.parse(iteration.priorResultContext(parent, { ...result, files: smallFiles }, "refine")).prior_result;
  assert.equal(capped.files.length, 8);
  assert.equal(capped.source_files_omitted, 2);
  const noFiles = JSON.parse(iteration.priorResultContext(parent, { ...result, files: [] }, "refine"));
  assert.equal(noFiles.prior_result.files, undefined);
  const malformed = JSON.parse(iteration.priorResultContext(parent, { ...result, files: [null, {}, { name: "asset.glb", content: "binary" }, { name: "index.html", content: 9 }] }, "refine"));
  assert.equal(malformed.prior_result.files, undefined);
  assert.equal(JSON.parse(iteration.priorResultContext(parent, null, "refine")).prior_result, null);
  console.log("Creation-source continuation checks passed: real source, provenance, truncation disclosure, escaped JSON budget, file limits, malformed input, and no fabricated result.");
} finally { await server.close(); }
