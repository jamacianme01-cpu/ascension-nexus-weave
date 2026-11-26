import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const read = path => readFileSync(path, "utf8");
const scene = read("src/components/ascension/crystal-experience.tsx");
const surface = read("src/components/ascension/crystal-surface.tsx");
const guest = read("src/lib/ascension/guest.functions.ts");
const art = "public/approved-scene/ascension-exact-approved-scene.png";
assert.equal(createHash("sha256").update(readFileSync(art)).digest("hex"),
  "cba074376cdb684e7286392f55e6bb95abdb37192325bdd9e3e37bc6d8c73495");
assert.match(scene, /ascension-exact-approved-scene\.png/);
assert.match(scene, /Enter ASCENSION using the Library Card/);
assert.match(scene, /Welcome to ASCENSION/);
assert.match(scene, /evolvingCrystalResultIndex/);
assert.match(scene, /continueDeviceIntent/);
assert.match(surface, /V1DesignViewport/);
assert.match(guest, /const complete = Boolean\(delivered/);
assert.doesNotMatch(guest, /delivered\?\.pathways.length === 3/);
assert.doesNotMatch(scene, /01-closed-book\.jpg|ENTER PATHWAY|living-pathway-options/);
for (const path of [
  "src/components/ascension/independent-engage.tsx",
  "src/components/ascension/living-tree.tsx",
  "src/components/ascension/living-tree.css",
  "src/components/ascension/living-tree-scene.css",
  "src/components/ascension/designed-flow.tsx",
  "src/components/ascension/designed-flow.css",
  "src/components/ascension/tree-studio.tsx",
  "src/components/ascension/tree-studio.css",
  "public/approved-scene/01-closed-book.jpg",
  "public/approved-scene/03-tree-emergence.png",
  "public/approved-scene/tree-of-knowledge-green-intent.png",
  "public/approved-scene/tree-of-knowledge-green-reveal.png",
  "public/designed-flow/assembled.jpg",
  "public/designed-flow/blueprint.jpg",
  "public/designed-flow/dissect.jpg",
  "public/designed-flow/exploded.jpg",
  "public/designed-flow/imploded.jpg",
  "public/designed-flow/spiral.jpg"
]) {
  assert.equal(existsSync(path), false, "Superseded interface must be removed: " + path);
}
console.log("PASS: current approved scene, one evolving result, original delivery contract, superseded interface removed");
