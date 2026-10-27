import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const engage=readFileSync("src/components/ascension/engage.tsx","utf8");
const viewer=readFileSync("src/components/ascension/RealityViewer.tsx","utf8");
const guide=readFileSync("src/components/ascension/AscensionGuide.tsx","utf8");
const tree=readFileSync("public/approved-scene/ascension-tree-behind-book-hq.jpg");
const gitSha=createHash("sha1").update(Buffer.from("blob "+tree.length+String.fromCharCode(0))).update(tree).digest("hex");
assert.equal(gitSha,"a96b7158192ae7892af14db280967ae3392eca3a",
  "THE ORIGINAL TREE IMAGE MUST NEVER CHANGE WITHOUT OWNER APPROVAL");
assert.match(engage,/const BOOK_TREE_SCENE = "\/approved-scene\/ascension-tree-behind-book-hq\.jpg";/);
assert.ok(engage.includes('<div className="ascension-scene-hero" aria-hidden="true">\n            <img className="ascension-tree-scene" src={BOOK_TREE_SCENE} alt="" draggable={false} />'));
assert.match(engage,/<AscensionGuide/);
assert.match(guide,/onInspect\(path\)/);
for (const view of ["DISSECT","EXPLODED VIEW","BLUEPRINT","3D VIEW"])
  assert.ok(viewer.includes(view));
assert.match(viewer,/ascension-v1-view-description/);
assert.match(viewer,/awaitingFaithfulMesh/);
console.log("ASCENSION V1 original Tree unchanged; guide, viewer modes and proof boundary checks passed");
