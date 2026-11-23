import assert from "node:assert/strict";
import { readPendingGoverned, savePendingGoverned, clearPendingGoverned } from
  "../src/lib/ascension/pending-governed-session.mjs";
const data = new Map();
const store = {
  getItem: k => data.get(k) ?? null,
  setItem: (k,v) => data.set(k,v),
  removeItem: k => data.delete(k),
};
const creds = {
  crystalId: "1084bada-be00-4dc3-9844-a9219d21b7d0",
  requestId: "3b2c4515-cf14-4bc1-83d4-f64492e497bb",
  guestToken: "88112f64-1a10-4478-9814-913211121e01",
};
const now = 2000000000000;
assert.equal(readPendingGoverned(store,now),null);
assert.equal(savePendingGoverned(store,creds,now),true);
assert.deepEqual(readPendingGoverned(store,now+1000),creds);
assert.equal(data.size,1);
assert.equal(readPendingGoverned(store,now+8*24*60*60*1000),null);
assert.equal(data.size,0);
assert.throws(()=>savePendingGoverned(store,{...creds,requestId:"bad"},now));
savePendingGoverned(store,creds,now);
clearPendingGoverned(store);
assert.equal(readPendingGoverned(store,now),null);
console.log("PASS: same-tab governed request continuation with expiry and cleanup.");

// Terminal governed failures must stop polling and drop the tab resume token;
// transient communication errors must retain it for a later retry.
import { readFileSync } from "node:fs";
const tree = readFileSync(new URL("../src/components/ascension/crystal-experience.tsx", import.meta.url), "utf8");
assert.match(tree, /if \(run\.status === "failed" \|\| run\.status === "rejected"\) \{[\s\S]*?finished = true;[\s\S]*?clearPendingGoverned\(window\.sessionStorage\);[\s\S]*?stopGovernedPolling\(\);[\s\S]*?return;/);
assert.match(tree, /if \(failures >= 3\) \{[\s\S]*?stopGovernedPolling\(\);[\s\S]*?setIssue\("Governed engine:/);

// A verified run with a completed but empty/invalid delivery is terminal;
// a response still marked running continues polling as before.
const completedEmpty = tree.slice(
  tree.indexOf('if (delivery.source !== "governed"'),
  tree.indexOf("governedChoices.current = choices;", tree.indexOf('if (delivery.source !== "governed"')),
);
assert.ok(completedEmpty.includes("clearPendingGoverned(window.sessionStorage);"));
assert.ok(completedEmpty.includes("stopGovernedPolling();"));
assert.ok(completedEmpty.includes("if (!choices.length) {"));
assert.ok(completedEmpty.includes('speak("The completed governed run has no usable result.'));
assert.match(tree, /if \(delivery\?\.status !== "completed"\) \{ failures = 0; return; \}/);
