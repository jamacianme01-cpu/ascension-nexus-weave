import assert from "node:assert/strict";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } },
});
try {
  const { normalizeOutputVersions, needsVersionCompletion } = await server.ssrLoadModule(
    "/src/lib/ascension/output-versions.server.ts");
  const { parseDelivery, assessCreatedOutputVersions } = await server.ssrLoadModule("/src/lib/ascension/result-model.ts");
  const id = ["branch-one", "branch-two", "branch-three"];
  const version = (id, kind, source) => ({
    id, kind, label: id, summary: "Distinct approach for the same objective",
    status: "created", blend_from: kind === "blend" ? [...idArray] : [],
    verification_scope: "Syntax and file-hash verified; behavior not checked",
    files: [{ name: "index.html", content: `<html><body><button id="action" aria-label="Perform an action">Act</button><main id="output">Interactive workspace ready for testing</main><script>document.getElementById("action").addEventListener("click",()=>{document.getElementById("output").textContent="Executed ${source} distinct implementation";});</script></body></html>` }],
  });
  const idArray = [...id];
  const raw = { versions: [
    version(id[0], "pathway", "const approach=1"),
    version(id[1], "pathway", "const approach=2"),
    version(id[2], "pathway", "const approach=3"),
    version("blend", "blend", "const combined=123"),
  ] };
  const normalized = normalizeOutputVersions(raw, id);
  assert.equal(needsVersionCompletion(null), true);
  assert.equal(needsVersionCompletion({ versions: [] }), true);
  assert.equal(needsVersionCompletion(normalized), false);
  assert.equal(needsVersionCompletion({ versions: [
    ...normalized.versions.slice(0, 3),
    { ...normalized.versions[3], status: "unavailable", files: [] },
  ] }), true);
  assert.equal(normalized.versions.length, 4);
  assert.equal(new Set(normalized.versions.flatMap(x => x.files.map(y => y.sha256))).size, 4);
  assert.equal(normalized.versions[3].kind, "blend");
  assert.equal(normalized.versions[3].blend_from.length, 3);
  assert.deepEqual(normalizeOutputVersions({ versions: [
    raw.versions[0], raw.versions[1],
    {...raw.versions[2], status: "unavailable", files: [], verification_scope: "CAD executor unavailable"},
    raw.versions[3],
  ] }, id).versions[2].files, []);
  assert.throws(() => normalizeOutputVersions({ versions: raw.versions.slice(0, 3) }, id), /three governed pathways/);
  assert.throws(() => normalizeOutputVersions({ versions: [raw.versions[0], raw.versions[0], raw.versions[2], raw.versions[3]] }, id), /distinct ID/);
  assert.throws(() => normalizeOutputVersions({ versions: [
    raw.versions[0], {...raw.versions[1], files: raw.versions[0].files}, raw.versions[2], raw.versions[3],
  ] }, id), /Duplicate output/);
  assert.throws(() => normalizeOutputVersions({ versions: [
    {...raw.versions[0], status: "created", files: []}, ...raw.versions.slice(1),
  ] }, id), /Created versions must contain actual files/);
  assert.throws(() => normalizeOutputVersions({ versions: [
    {...raw.versions[0], files: [{...raw.versions[0].files[0], sha256: "sha256:fake"}]},
    ...raw.versions.slice(1),
  ] }, id), /hash mismatch/);
  assert.throws(() => normalizeOutputVersions({ versions: [
    ...raw.versions.slice(0, 3), {...raw.versions[3], blend_from: []},
  ] }, id), /Blend must cite/);

  const oldFailure = parseDelivery({
    kind: "not_produced",
    title: "make an app",
    body: "No app was created by the old external provider.",
    pathways: [], blend: null, files: [],
    limitations: ["External provider unavailable"],
    versions: normalized.versions,
  });
  assert.equal(oldFailure.files.length, 0);
  assert.equal(assessCreatedOutputVersions("make an app", oldFailure).length, 4);
  assert.equal(assessCreatedOutputVersions("make an app", {
    versions: [
      { ...normalized.versions[0], files: [{ name: "README.md", content: "# No code" }] },
      ...normalized.versions.slice(1),
    ],
  }).length, 3);
  assert.equal(assessCreatedOutputVersions("draw a device", oldFailure).length, 0);

  const engageUi = await readFile("src/components/ascension/engage.tsx", "utf8");
  assert.match(engageUi, /OPEN & INTERACT/);
  assert.match(engageUi, /STOP AUDIO · CLOSE PREVIEW/);
  assert.match(engageUi, /openPreviewId === version\.id && \(/);
  assert.match(engageUi, /onClick=\{\(\) => setOpenPreviewId/);
  assert.match(engageUi, /sandbox="allow-scripts"/);

  const delivery = parseDelivery({
    kind: "answer", title: "Any invention", body: "Version production status is attached",
    pathways: [], blend: null, files: [], limitations: ["Functional proof pending"],
    versions: normalized.versions,
  });
  assert.equal(delivery.versions?.length, 4);
  assert.equal(delivery.versions?.[0].files[0].name, "index.html");
  assert.equal(delivery.versions?.[3].kind, "blend");
  console.log("PASS four real, distinct output versions, blend lineage and fail-closed transport");
} finally {
  await server.close();
}
