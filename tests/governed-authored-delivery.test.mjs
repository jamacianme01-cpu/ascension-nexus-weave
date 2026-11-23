import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {selectGovernedAuthoredDelivery} from "../src/lib/ascension/engine/governed-authored-delivery.mjs";
import {deliveredCrystalChoices} from "../src/lib/ascension/governed-crystal-voice.mjs";

const actual=(id)=>({id,label:id,summary:id+" original generated output",
  model_spec:{parts:[{name:id+" part",purpose:"recorded",location:"recorded"}]},
  generated_image_url:"https://example.invalid/"+id+".png"});
const owner="Invent an owner-directed assistant with two original tasks";
const getFiles=()=>[];
const root=pathways=>({objective_delivery:{
  kind:"answer",title:"Original verified authored result",body:"Original answer, no paraphrase",
  pathways,blend:null,files:[],limitations:[],
}});
const three=selectGovernedAuthoredDelivery(root([actual("claude"),actual("grok"),actual("openai")]),
  owner,getFiles);
assert.deepEqual(three.pathways.map(x=>x.id),["claude","grok","openai"]);
assert.equal(deliveredCrystalChoices(three).length,3);
const partial=root([actual("claude"),actual("grok")]);
partial.objective_delivery.blend={...actual("blend"),blend_reason:"Actual recorded source blend"};
const chosen=selectGovernedAuthoredDelivery(partial,owner,getFiles);
assert.equal(chosen.pathways.length,2);
assert.equal(chosen.blend.id,"blend");
assert.deepEqual(deliveredCrystalChoices(chosen).map(x=>x.id),["claude","grok","blend"],
  "Preserve both real source pathways AND BLEND rather than silently dropping two");
assert.equal(deliveredCrystalChoices(chosen)[2].isBlend,true);
const single=selectGovernedAuthoredDelivery(root([actual("single")]),owner,getFiles);
assert.deepEqual(single.pathways.map(x=>x.id),["single"]);
assert.equal(deliveredCrystalChoices(single).length,1);
const directFour=selectGovernedAuthoredDelivery(root(
  [actual("first"),actual("second"),actual("third"),actual("fourth")]),owner,getFiles);
assert.equal(deliveredCrystalChoices(directFour).length,4);
assert.ok(deliveredCrystalChoices(directFour).every(x=>x.isBlend===false),
  "Do not relabel a fourth authored pathway as BLEND");
assert.equal(selectGovernedAuthoredDelivery({
  objective_planning:{branches:[actual("planning")]},execution_receipts:[{files:[]}]
},owner,getFiles),null,"A plan or receipt cannot pass as an original user-facing solution");
assert.equal(selectGovernedAuthoredDelivery(root([]),owner,getFiles),null);
const duplicate=partial;
duplicate.objective_delivery.blend={...actual("claude"),blend_reason:"Duplicate"};
assert.equal(selectGovernedAuthoredDelivery(duplicate,owner,getFiles),null,
  "Duplicate original identities must fail closed");
assert.equal(selectGovernedAuthoredDelivery(root(
  [actual("first"),actual("second"),actual("third"),actual("fourth"),actual("fifth")]),
  owner,getFiles),null,"No fifth path");
const source=readFileSync("src/lib/ascension/engine/delivery.server.ts","utf8");
assert.match(source,/selectGovernedAuthoredDelivery\(result, run\.objective, artifactFiles\)/);
assert.doesNotMatch(source,/paths\.length !== 3/,
  "Runtime projection must not erase legitimate partial governed results");
console.log("PASS: original ASCENSION authored pathway projection, real partials, no duplicates or fifth slot");
