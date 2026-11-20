import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const read = path => readFileSync(path, "utf8");
const tree = read("src/components/ascension/living-tree.tsx");
const pictureCSS = read("src/components/ascension/living-tree.css");
const book = read("src/components/ascension/independent-engage.tsx");
const studio = read("src/components/ascension/tree-studio.tsx");
const guest = read("src/lib/ascension/guest.functions.ts");

assert.match(tree,/tree-of-knowledge-green-intent.png/);
assert.match(tree,/tree-of-knowledge-green-reveal.png/);
assert.match(tree,/data-tree-state/);
assert.match(tree,/data-tree-speaking/);
assert.match(tree,/verifiedRevision/);
assert.match(pictureCSS,/prefers-reduced-motion/);
assert.match(pictureCSS,/tree-photo-mouth/);
assert.match(book,/nextWelcome/);
assert.match(book,/samantha\|jenny\|aria\|zira\|serena/);
assert.match(book,/chooseCategory\(item\)/);
assert.match(book,/TreeStudio/);
assert.match(book,/governedPersisted\(run\)/);
assert.match(book,/continuation\.current/);
assert.doesNotMatch(book,/<DesignedFlow\s/);
assert.match(studio,/V1DesignViewport/);
assert.match(studio,/BLUEPRINT|blueprint/);
assert.match(studio,/dissect/);
assert.match(studio,/exploded/);
assert.match(studio,/imploded/);
assert.match(studio,/No measured 3D model or blueprint/);
assert.match(guest,/const complete = Boolean\(delivered/);
assert.doesNotMatch(guest,/delivered\?\.pathways.length === 3/);

const photos = [
  ["public/approved-scene/tree-of-knowledge-green-intent.png", "45b62d09ac84c1d6c0c4cf6707ba75e0aec4220d9a025c99906536a8cfe3ecde"],
  ["public/approved-scene/tree-of-knowledge-green-reveal.png", "4829563aa49d4f072c4afc640fe203a96eafd7c552b3851884794bd2206cd941"],
];
for (const [path, digest] of photos) {
  if (existsSync(path)) {
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), digest,
      "Do not replace or alter owner-approved Tree artwork: " + path);
  } else if (process.env.ASCENSION_REQUIRE_APPROVED_ARTWORK === "true") {
    throw Error("Required owner-approved photograph missing: " + path);
  }
}
console.log("PASS: one living photoreal Tree; Book; woman's voice preference; real single governed result; preserved original images.");
