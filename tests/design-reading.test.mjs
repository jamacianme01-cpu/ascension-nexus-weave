import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const flow = await readFile("src/components/ascension/designed-flow.tsx", "utf8");
const engage = await readFile("src/components/ascension/independent-engage.tsx", "utf8");
const route = await readFile("src/routes/api/public/ascension/independent.ts", "utf8");

assert.match(flow, /\/designed-flow\/spiral\.jpg/);
assert.match(flow, /Screens taken from the designed flow, unchanged/);
assert.doesNotMatch(flow, /design-reading/);
assert.doesNotMatch(engage, /objective=\{objective/);
assert.match(route, /kind: "design-reading"/);
assert.doesNotMatch(route, /own image-generation engine is not yet connected/);
console.log("PASS their drawn screens stay, and the picture route keeps the sentence");
