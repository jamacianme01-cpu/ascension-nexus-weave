import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  governedVoiceCommand, deliveredCrystalChoices, choiceForVoiceCommand,
} from "../src/lib/ascension/governed-crystal-voice.mjs";
const entry=readFileSync("src/components/ascension/crystal-experience.tsx","utf8");
const fixture = id=>({
  id,label:id,summary:id+" original distinct description",steps:[],tradeoffs:[],
  model_spec:{parts:[{name:id+" component",location:"the actual recorded location",purpose:"the recorded purpose"}]},
  generated_image_url:"https://example.invalid/"+id+".png",
  generated_blueprint_url:id==="claude" ? "https://example.invalid/blueprint.png" : null,
  model_url:id==="claude"?"https://example.invalid/verified-job-output.glb":null,
});
const payload={kind:"answer",title:"Governed owner result",body:"Owner's original text",
  pathways:[fixture("claude"),fixture("grok"),fixture("openai")],
  blend:{...fixture("combined"),label:"Distinct combined result",blend_from:["claude","grok"],blend_reason:"Actual recorded blend"},
  files:[],limitations:["Engineering measurements not physically tested"]};
const choices=deliveredCrystalChoices(payload);
assert.equal(choices.length,4);
assert.deepEqual(choices.map(x=>x.id),["claude","grok","openai","combined"]);
assert.equal(choices[0].design.modelUrl,"https://example.invalid/verified-job-output.glb");
assert.equal(choices[0].design.blueprintUrl,"https://example.invalid/blueprint.png");
assert.deepEqual(choices[0].parts,[{name:"claude component",
  location:"the actual recorded location",purpose:"the recorded purpose"}]);
assert.equal(choices[3].title,"Distinct combined result");
assert.equal(choiceForVoiceCommand("choose one",choices),0);
assert.equal(choiceForVoiceCommand("open pathway grok",choices),1);
assert.equal(choiceForVoiceCommand("select openai",choices),2);
assert.equal(choiceForVoiceCommand("choose BLEND",choices),3,
  "The recorded fourth blend must remain voice-accessible even with a different authentic label");
assert.equal(choiceForVoiceCommand("choose five",choices),-1);
assert.equal(choiceForVoiceCommand("open a different invention",choices),-1);
assert.equal(deliveredCrystalChoices({...payload,blend:null}).length,3,
  "No fourth pathway may be fabricated when the engine did not deliver BLEND");
assert.equal(deliveredCrystalChoices({...payload,blend:null,pathways:[]}).length,1,
  "Actual single governed answer is allowed without fabricated models");
assert.equal(deliveredCrystalChoices({...payload,kind:"not_produced"}).length,0);
assert.equal(deliveredCrystalChoices(null).length,0);
assert.equal(deliveredCrystalChoices({...payload,pathways:[{
  ...fixture("only"),generated_image_url:null,model_url:null,generated_blueprint_url:null,
}],blend:null})[0].design,null,
"Never invent a design image or geometry when the governed runtime has none");
for(const spoken of ["run ASCENSION's engines","run my intent through ASCENSION engines",
  "engage ASCENSION","use ASCENSION engines"]) assert.equal(governedVoiceCommand(spoken),true);
for(const input of ["make a drone","build on result","open my original crystal","save my library card","show blueprint"]) {
  assert.equal(governedVoiceCommand(input),false,"No implicit remote upload: "+input);
}
assert.match(entry,/if \(governedVoiceCommand\(input\)\)/,
  "Only an explicit voice command can initiate the initial governed submission");
assert.match(entry,/void runGovernedIntent\(\)/);
assert.match(entry,/const original = await readDeviceCrystal\(selected\.id\)/);
assert.match(entry,/objective: change \|\| original\.intent/,
  "Send the EXACT locally stored original only after owner authorization");
assert.match(entry,/parentRequestId: previous\.requestId/);
assert.match(entry,/parentGuestToken: previous\.guestToken/);
assert.match(entry,/followUp: "continue"/);
assert.match(entry,/delivery\.source !== "governed"/);
assert.match(entry,/if \(choices\.length > 1\)/,
  "Show only the real number of delivered pathways");
assert.match(entry,/setView\("assembled"\)/);
assert.match(entry,/setAnswer\(governedChoiceAnswer\(selected\)\)/);
assert.match(entry,/The server's verified run is NOT automatically copied/,
  "No automatic physical verification or fabricated Knowledgeverse growth");
assert.match(entry,/ascension-exact-approved-scene\.png/,
  "Keep the exact original Tree/Book scene");
const begin=entry.slice(entry.indexOf("async function enter()"),entry.indexOf("// The browser mirrors only results"));
assert.doesNotMatch(begin,/submitGuestObjective|runGovernedIntent/,
  "Entering the Book must never automatically upload an invention");
const local=entry.slice(entry.indexOf("async function syncDevice()"),entry.indexOf("async function runGovernedIntent"));
assert.match(local,/await startDeviceIntent\(statement\)/,
  "Original private device crystal creation must remain local-first");
console.log("PASS: owner-authorized engine handoff, literal original preservation, truthful four-or-single pathway voice reveal, no automatic disclosure");
