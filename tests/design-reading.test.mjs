import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const engage = await readFile("src/components/ascension/independent-engage.tsx", "utf8");
const route = await readFile("src/routes/api/public/ascension/independent.ts", "utf8");

assert.match(engage, /className="ascension-picture"/);
assert.match(engage, /className="ascension-paths"/);
assert.doesNotMatch(engage, /DesignedFlow/);
assert.match(route, /kind: "design-reading"/);
assert.doesNotMatch(route, /own image-generation engine is not yet connected/);
console.log("PASS the first screen keeps the sentence with the pathways");
