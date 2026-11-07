import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
async function module(path) {
  const code = ts.transpileModule(readFileSync(new URL("../" + path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}
const { compileDesignIdentity, objectiveQualifier } = await module("src/lib/ascension/design-image-brief.ts");
const { assessRaster } = await module("src/lib/ascension/image-identity-check.ts");

const qualifier = objectiveQualifier("make worker drones for people with dementia");
assert.equal(qualifier, "for people with dementia");
assert.equal(objectiveQualifier("make worker drones\nBuild on the selected pathway: drones for people with dementia"), "");

const identity = compileDesignIdentity(
  "make worker drones for people with dementia",
  "Modular multirotor worker drone",
  ["Airframe", "Gripper"],
  "A worker drone.",
);
assert.match(identity.prompt, /for people with dementia/);
assert.match(identity.prompt, /^One single unmanned multirotor worker drone/);
assert.doesNotMatch(identity.negative, /\bpeople\b/);
assert.match(identity.negative, /collage/);
assert.match(identity.negative, /split screen/);
assert.match(identity.negative, /\bhands\b/);

const plain = compileDesignIdentity("make worker drones", "Modular multirotor worker drone", [], "A worker drone.");
assert.doesNotMatch(plain.prompt, /dementia|people/);
assert.match(plain.negative, /\bpeople\b/);

function canvas(paint) {
  const gray = new Uint8Array(96 * 96).fill(180);
  paint(gray, 96);
  return gray;
}
const split = canvas((gray, width) => {
  for (let y = 8; y < 88; y++) for (let x = 6; x < 34; x++) gray[y * width + x] = 20;
  for (let y = 8; y < 88; y++) for (let x = 62; x < 90; x++) gray[y * width + x] = 20;
});
const collage = assessRaster(split, 96, 96, { count: 1 });
assert.equal(collage.ok, false);
assert.equal(collage.collage, true);
assert.match(collage.reason, /split layout/);

const one = canvas((gray, width) => {
  for (let y = 30; y < 66; y++) for (let x = 30; x < 66; x++) gray[y * width + x] = 24;
});
const single = assessRaster(one, 96, 96, { count: 1 });
assert.equal(single.ok, true, single.reason);
console.log("PASS picture watchdog: user purpose reaches the prompt, collage and split layout stay refused");
