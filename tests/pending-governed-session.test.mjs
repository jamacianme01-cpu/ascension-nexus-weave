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
