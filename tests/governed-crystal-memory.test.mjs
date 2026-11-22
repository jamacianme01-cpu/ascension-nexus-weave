import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateGovernedReceipt, validateGovernedHistory,
  mergeGovernedHistory, markGovernedSelection,
} from "../src/lib/ascension/governed-crystal-memory.mjs";

const receipt = {
  source: "governed",
  requestId: "88888888-8888-4888-8888-888888888888",
  guestToken: "77777777-7777-4777-8777-777777777777",
  receivedAt: "2026-11-22T19:00:00.000Z",
  choices: [{
    id: "recorded-pathway", title: "Original result", body: "Original owner concept",
    parts: [{name:"Guidance drone",location:"Above the dock",purpose:"Guidance"}],
    design: {title:"Original result",summary:"Original owner concept",
      imageUrl:"https://example.invalid/original-image.png",
      blueprintUrl:null,modelUrl:null},
    limitations:["No verified dimensions"],modelStatus:"running",
  }],
  selectedIndex: null,
};
const clean=validateGovernedReceipt(receipt);
assert.deepEqual(clean,receipt,"Do not rewrite original result text");
assert.deepEqual(validateGovernedHistory(undefined),[],
  "Old encrypted Library Cards without engine receipts remain compatible");
const first=mergeGovernedHistory(undefined,[clean]);
assert.equal(first.length,1);
assert.strictEqual(mergeGovernedHistory(first,[clean]),first,
  "Repeated imports must not rewrite a known original");
const selected=markGovernedSelection(first,receipt.requestId,0);
assert.equal(selected[0].selectedIndex,0);
assert.equal(first[0].selectedIndex,null,"Selection may not mutate the earlier history");
assert.strictEqual(markGovernedSelection(selected,receipt.requestId,0),selected);
const completed=structuredClone(clean);
completed.choices[0].modelStatus="completed";
completed.choices[0].design.modelUrl="https://example.invalid/real-delivered.glb";
const later=mergeGovernedHistory(selected,[completed]);
assert.equal(later[0].choices[0].design.modelUrl,"https://example.invalid/real-delivered.glb");
assert.equal(later[0].choices[0].design.imageUrl,receipt.choices[0].design.imageUrl,
  "Original artwork cannot be replaced by a later model result");
assert.equal(later[0].selectedIndex,0);
assert.strictEqual(mergeGovernedHistory(later,[clean]),later,
  "Older device backups must not erase a completed model");
assert.throws(()=>mergeGovernedHistory(later,[{
  ...clean,guestToken:"66666666-6666-4666-8666-666666666666",
}]),/conflicts/);
assert.throws(()=>mergeGovernedHistory(later,[{
  ...clean,choices:[{...clean.choices[0],body:"Unexpected different invention"}],
}]),/disagree/);
assert.throws(()=>validateGovernedReceipt({...clean,source:"unverified_local_draft"}),
  /invalid credentials/);
assert.throws(()=>validateGovernedReceipt({...clean,choices:[
  clean.choices[0],{...clean.choices[0]},
]}),/duplicate pathway/);
assert.throws(()=>validateGovernedReceipt({...clean,choices:[{
  ...clean.choices[0],
  design:{...clean.choices[0].design,modelUrl:"javascript:alert(1)"},
}]}),/invalid media provenance/);
assert.throws(()=>validateGovernedHistory(Array(17).fill(clean)),/unsupported/);
assert.throws(()=>markGovernedSelection(first,receipt.requestId,2),/not saved/);

const storage=readFileSync("src/lib/ascension/device-knowledgeverse.ts","utf8");
const scene=readFileSync("src/components/ascension/crystal-experience.tsx","utf8");
const backup=readFileSync("src/lib/ascension/device-backup.ts","utf8");
const sync=readFileSync("src/lib/ascension/device-folder-sync.ts","utf8");
assert.match(storage,/governedResults: validateGovernedHistory\(input\.governedResults\)/);
assert.match(storage,/mergeGovernedHistory\(/);
assert.match(storage,/recordDeviceGovernedReceipt/);
assert.match(storage,/selectDeviceGovernedResult/);
assert.match(storage,/Concurrent Library Card changes/);
assert.match(scene,/const recorded = crystal\.governedResults\?\.at\(-1\)/);
assert.match(scene,/recordDeviceGovernedReceipt\(selected\.id/);
assert.match(scene,/selectDeviceGovernedResult\(/);
assert.match(scene,/recordDeviceGovernedReceipt\(authorized\.crystalId/);
assert.match(backup,/listDeviceCrystals/);
assert.match(sync,/mergedGovernedResults/);
assert.match(scene,/ascension-exact-approved-scene\.png/);
console.log("PASS: immutable original, AES-recorded governed recall, add-only cross-device convergence, selected pathway and real model preservation.");
