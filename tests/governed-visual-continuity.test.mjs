import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  singleDeliveredResult, waitingOnDeliveredModels, reconcileDeliveredVisuals,
} from "../src/lib/ascension/governed-visual-continuity.mjs";

const deliveredPath = {
  id:"auth-real-pathway", label:"Owner-selected real design",
  summary:"The owner's independently delivered concept.",
  steps:["Maintain the recorded original"], tradeoffs:[],
  model_spec: {
    parts:[{name:"Shared memory dock",location:"Base",purpose:"Connect both verified components"}],
  },
  generated_image_url:"https://example.invalid/user-owned-concept.png",
  generated_blueprint_url:"https://example.invalid/user-owned-blueprint.png",
  model_url:null, model_status:"running",
};
const delivered = {
  kind:"answer",title:"Real governed result",
  body:"This is the owner's original governed delivery and accompanying source.",
  pathways:[deliveredPath],blend:null,files:[{name:"real_source.txt",content:"Owner's original source bytes"}],
  limitations:["Physical dimensions are not verified"],
};
const first = singleDeliveredResult(delivered);
assert.equal(first.pathways.length,0,"Do not fabricate four model outputs");
assert.equal(first.blend.id,deliveredPath.id,"Retain actual pathway identity");
assert.equal(first.blend.imageUrl,deliveredPath.generated_image_url);
assert.equal(first.blend.blueprintUrl,deliveredPath.generated_blueprint_url);
assert.equal(first.blend.modelUrl,null);
assert.equal(first.blend.modelStatus,"running");
assert.deepEqual(first.blend.parts,[{
  name:"Shared memory dock",location:"Base",purpose:"Connect both verified components",
}]);
assert.deepEqual(first.files,delivered.files);
assert.equal(waitingOnDeliveredModels(first),true);

const completed=singleDeliveredResult({...delivered,pathways:[{
  ...deliveredPath, model_url:"https://example.invalid/real-worker-output.glb",
  model_status:"completed",
  generated_image_url:"https://example.invalid/new-picture-not-to-replace-original.png",
}]});
const filled=reconcileDeliveredVisuals(first,completed);
assert.notStrictEqual(filled,first);
assert.equal(filled.blend.modelUrl,"https://example.invalid/real-worker-output.glb");
assert.equal(filled.blend.modelStatus,"completed");
assert.equal(filled.blend.imageUrl,first.blend.imageUrl,
  "Late model hydration cannot replace the originally delivered picture");
assert.equal(filled.blend.blueprintUrl,first.blend.blueprintUrl);
assert.equal(filled.blend.summary,first.blend.summary);
assert.deepEqual(filled.files,first.files);
assert.equal(waitingOnDeliveredModels(filled),false);
assert.strictEqual(reconcileDeliveredVisuals(filled,completed),filled,
  "Duplicate polling must not create new result objects");

const old={...first,blend:{...first.blend,modelStatus:"queued"}};
const advanced=reconcileDeliveredVisuals(old,{...completed,blend:{
  ...completed.blend,modelStatus:"running",modelUrl:null,
}});
assert.equal(advanced.blend.modelStatus,"running");
const stale=reconcileDeliveredVisuals(advanced,old);
assert.equal(stale.blend.modelStatus,"running",
  "A stale queue projection cannot regress a running model");
assert.strictEqual(reconcileDeliveredVisuals(filled,{
  ...completed,introduction:"Another unrelated request",
}),filled,"An unrelated objective cannot hydrate this design");
assert.strictEqual(reconcileDeliveredVisuals(filled,{
  ...completed,blend:{...completed.blend,id:"foreign-pathway"},
}),filled,"A different pathway ID cannot replace the original");
assert.strictEqual(reconcileDeliveredVisuals(filled,{
  ...completed,blend:{...completed.blend,summary:"Different invention"},
}),filled,"A different invention must not overwrite the original");
assert.equal(singleDeliveredResult({...delivered,pathways:[]}).blend.modelUrl,null,
  "Absent generation may not invent geometry");
const failure=reconcileDeliveredVisuals(first,{...first,blend:{
  ...first.blend,modelStatus:"failed",
}});
assert.equal(waitingOnDeliveredModels(failure),false);
assert.equal(failure.blend.modelUrl,null);

const component=readFileSync("src/components/ascension/independent-engage.tsx","utf8");
assert.match(component,/singleDeliveredResult\(delivery\)/,
  "The existing governed single-output flow must retain actual image links");
assert.match(component,/modelStatus: path\.model_status/,
  "The real model status must reach the Tree");
assert.match(component,/waitingOnDeliveredModels\(result\)/,
  "Pending delivered models must be actively refreshed");
assert.match(component,/getGuestObjectiveDelivery\(\{data:run\}\)/,
  "Refresh must use the same authorized guest token and original request");
assert.match(component,/reconcileDeliveredVisuals\(previous, later\)/,
  "Only missing later assets may be added to the original approved result");
assert.match(component,/activeRun\.current\?\.requestId !== run\.requestId/,
  "A different run must never claim the earlier design's media");
console.log("PASS: truthful single-output design URLs, delayed authorized GLB hydration, original text/image retention, no invented geometry.");
