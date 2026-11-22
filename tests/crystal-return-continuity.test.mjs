import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { isContinuationPrompt } from "../src/lib/ascension/voice-intent-flow.mjs";

const source = readFileSync("src/lib/ascension/crystal-return.ts", "utf8");
const result = ts.transpileModule(source, {
  fileName: "crystal-return.ts",
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const growth = await import("data:text/javascript;base64," + Buffer.from(result).toString("base64"));

const one = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedGrowthCount: 4 };
const two = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", verifiedGrowthCount: 0 };
const three = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", verifiedGrowthCount: 2 };
const seen = { [one.id]: 2, [two.id]: 0, [three.id]: 2 };
assert.equal(growth.newlyVerifiedCount(one, seen), 2);
assert.equal(growth.newlyVerifiedCount(two, seen), 0);
assert.equal(growth.newlyVerifiedCount(three, seen), 0);
assert.deepEqual(growth.pendingGrowthSummary([one, two, three], seen), {
  crystalCount: 1, revisionCount: 2,
});
assert.equal(growth.describeNewGrowth(0), "");
assert.match(growth.describeNewGrowth(1), /one newly verified development/);
assert.match(growth.describeNewGrowth(2), /2 newly verified developments/);
assert.match(growth.welcomeBackGrowth(1, 2), /1 of your intent crystals have 2 newly verified developments/);
assert.doesNotMatch(growth.welcomeBackGrowth(0, 0), /newly verified developments/);
const updated = growth.markGrowthSeen(one, seen);
assert.equal(updated[one.id], 4);
assert.equal(seen[one.id], 2, "recording a visit cannot mutate the existing ledger");
assert.equal(growth.newlyVerifiedCount(one, updated), 0);
assert.equal(growth.markGrowthSeen({...one,verifiedGrowthCount:1},updated)[one.id], 4,
  "revisiting an older snapshot cannot erase the newer verified count");
assert.deepEqual(growth.parseSeenGrowth("{"), {});
assert.deepEqual(growth.parseSeenGrowth("[]"), {});
assert.deepEqual(growth.parseSeenGrowth("null"), {});
assert.deepEqual(growth.parseSeenGrowth(JSON.stringify({
  [one.id]: 3,
  "not-a-crystal": 22,
  [two.id]: -2,
})), { [one.id]: 3 });
assert.equal(growth.newlyVerifiedCount({ ...one, verifiedGrowthCount: Number.NaN }, {}), 0);
assert.equal(growth.newlyVerifiedCount({ ...one, verifiedGrowthCount: -50 }, {}), 0);

const component = readFileSync("src/components/ascension/crystal-experience.tsx", "utf8");
assert.match(component, /const unseen = pendingGrowthSummary\(saved, seenVerifiedGrowth\(\)\)/);
assert.match(component, /deviceDraftAnswer\(crystal\)/);
assert.match(component, /readDeviceCrystal\(id\)/);
assert.match(component, /if \(!parent\) setAnswer\(null\)/);
assert.match(component, /Unverified local draft|unverified draft|not been independently verified/);
assert.match(component, /if \(speechSerial\.current !== serial\) return/);
assert.match(component, /isContinuationPrompt\(input\)/);
assert.equal(isContinuationPrompt("continue this intent"), true);
assert.equal(isContinuationPrompt("build on result"), true);
assert.match(component, /I haven't found that intent on this Library Card/);
assert.match(component, /Tell me which intent crystal you would like me to retrieve/);
assert.ok(component.indexOf("if (/^(?:what has grown") < component.indexOf("if (answerRef.current)"),
  "Growth questions must work even without an open answer");
assert.doesNotMatch(component, /const TREE = |const KEEPER = /);
console.log("PASS: local intent recall and return-state helpers, no fabricated verification, safe voice callbacks.");
