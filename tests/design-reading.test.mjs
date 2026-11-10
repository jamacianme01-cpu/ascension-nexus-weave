import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const engage = await readFile("src/components/ascension/independent-engage.tsx", "utf8");
const flow = await readFile("src/components/ascension/designed-flow.tsx", "utf8");
const route = await readFile("src/routes/api/public/ascension/independent.ts", "utf8");

assert.match(engage, /DesignedFlow/);
assert.match(engage, /objective=\{objective\.trim\(\)\}/);
assert.doesNotMatch(engage, /phrase\.length <= 28/);
assert.match(flow, /designed-reading-picture/);
assert.doesNotMatch(flow, /designed-subject-picture/);
assert.doesNotMatch(flow, /ChatGPT|Claude|Grok/);
assert.match(flow, /\/designed-flow\/spiral\.jpg/);
assert.match(route, /kind: "design-reading"/);
assert.doesNotMatch(route, /own image-generation engine is not yet connected/);
console.log("PASS pathway screens stay, and the sentence is in the picture");
