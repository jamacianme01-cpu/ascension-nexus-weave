import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  governedVoiceCommand, deliveredCrystalChoices, choiceForVoiceCommand,
  crystalHasPendingModels, reconcileCrystalMedia, evolvingCrystalResultIndex,
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
assert.equal(evolvingCrystalResultIndex(choices),3,
  "The actual blend becomes the continuing result, not a menu");
assert.equal(evolvingCrystalResultIndex(choices,1),1,
  "A previously selected recorded result is preserved on recall");
assert.equal(evolvingCrystalResultIndex(choices,99),3,
  "Invalid legacy saved selection must never become a fabricated result");
assert.deepEqual(choices.map(x=>x.id),["claude","grok","openai","combined"]);
assert.equal(choices[0].design.modelUrl,"https://example.invalid/verified-job-output.glb");
assert.equal(choices[0].design.blueprintUrl,"https://example.invalid/blueprint.png");
assert.deepEqual(choices[0].parts,[{name:"claude component",
  location:"the actual recorded location",purpose:"the recorded purpose"}]);
assert.equal(choices[3].title,"Distinct combined result");
assert.equal(choices[3].isBlend,true);
assert.equal(choices[0].isBlend,false);
const partial=deliveredCrystalChoices({
  ...payload, pathways:[fixture("claude"),fixture("grok")],
});
assert.deepEqual(partial.map(c=>c.id),["claude","grok","combined"],
  "Partial source deliveries remain genuine and are never filled with fake slots");
assert.equal(evolvingCrystalResultIndex(partial),2,
  "Use a real delivered blend even when only partial source outputs exist");
  "A real BLEND must not erase two actually delivered pathways");
assert.equal(choiceForVoiceCommand("choose blend",partial),2,
  "The actual BLEND remains voice-accessible without a fabricated fourth slot");
assert.equal(evolvingCrystalResultIndex(deliveredCrystalChoices({
  ...payload, pathways:[], blend:null,
})),0, "An original single governed result remains a usable evolving result");
assert.equal(evolvingCrystalResultIndex([]),-1);
const fourWithoutBlend=deliveredCrystalChoices({
  ...payload, pathways:[fixture("claude"),fixture("grok"),fixture("openai"),fixture("fourth")],
});
assert.deepEqual(fourWithoutBlend.map(c=>c.id),["claude","grok","openai","fourth"],
  "Real source outputs remain stored without inventing BLEND");
assert.equal(evolvingCrystalResultIndex(fourWithoutBlend),0,
  "Without a recorded blend choose the first actual answer, never synthesize one");
  "Never invent a fifth slot or hide genuine delivered pathways");
assert.equal(choiceForVoiceCommand("choose blend",fourWithoutBlend),-1,
  "Four real pathways alone must not be mislabeled as a BLEND");
const collision=deliveredCrystalChoices({
  ...payload, pathways:[fixture("claude"),fixture("combined")],
});
assert.deepEqual(collision.map(c=>c.id),["claude","combined"],
  "A repeated BLEND id may never create a duplicate encrypted pathway");
assert.equal(crystalHasPendingModels(choices),false);
const waiting={...payload,pathways:[{
  ...fixture("claude"),model_url:null,model_status:"running",
},fixture("grok"),fixture("openai")]};
const pendingChoices=deliveredCrystalChoices(waiting);
assert.equal(crystalHasPendingModels(pendingChoices),true);
const refreshed=reconcileCrystalMedia(pendingChoices,choices);
assert.equal(refreshed[0].design.modelUrl,"https://example.invalid/verified-job-output.glb");
assert.equal(refreshed[0].design.imageUrl,pendingChoices[0].design.imageUrl);
assert.equal(crystalHasPendingModels(refreshed),false);
assert.strictEqual(reconcileCrystalMedia(refreshed,choices),refreshed);
assert.strictEqual(reconcileCrystalMedia(refreshed,choices.slice(0,3)),refreshed,
  "No shape mismatch may erase a prior result");
assert.strictEqual(reconcileCrystalMedia(refreshed,[
  {...choices[0],body:"A different intent"},...choices.slice(1),
]),refreshed,"No other invention may replace this original");
assert.strictEqual(reconcileCrystalMedia(refreshed,pendingChoices),refreshed,
  "A stale model status must not regress a real delivered GLB");
assert.equal(choiceForVoiceCommand("choose one",choices),0);
assert.equal(choiceForVoiceCommand("open pathway grok",choices),1);
assert.equal(choiceForVoiceCommand("select openai",choices),2);
assert.equal(choiceForVoiceCommand("choose BLEND",choices),3,
  "The recorded fourth blend must remain voice-accessible even with a different authentic label");
assert.equal(choiceForVoiceCommand("choose five",choices),-1);
const descriptiveTitles = choices.map((choice,i) => ({
  ...choice, title: ["Structural design", "Mechanical approach", "Software system", "Combined result"][i],
}));
assert.equal(choiceForVoiceCommand("choose claude",descriptiveTitles),0,
  "A genuine provider ID must remain selectable even with a descriptive title");
assert.equal(choiceForVoiceCommand("enter the grok pathway",descriptiveTitles),1);
assert.equal(choiceForVoiceCommand("select openai",descriptiveTitles),2);
assert.equal(choiceForVoiceCommand("choose blend",descriptiveTitles),3);
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
assert.match(entry,/savePendingGoverned\(window\.sessionStorage, credentials\)/);
assert.match(entry,/readPendingGoverned\(window\.sessionStorage\)/);
assert.match(entry,/await watchGovernedIntent\(selected, pending, epoch\)/);
assert.match(entry,/clearPendingGoverned\(window\.sessionStorage\)/);
assert.match(entry,/if \(receiptSaved\) clearPendingGoverned\(window\.sessionStorage\)/,
  "Only clear recovery after the actual encrypted governed receipt was saved");
assert.match(entry,/const browserRecognitionAllowed = useRef\(false\)/);
assert.match(entry,/const localRecognitionUnavailable = useRef\(false\)/);
assert.match(entry,/if \(automatic\) \{ setBackup\(true\); return; \}/,
  "Automatic Tree welcome must never authorize a remote speech provider");
assert.match(entry,/window\.confirm\(/,
  "Browser speech service requires explicit owner consent");
assert.match(entry,/mic\.processLocally = true/);
assert.match(entry,/objective: change \|\| original\.intent/,
  "Send the EXACT locally stored original only after owner authorization");
assert.match(entry,/parentRequestId: previous\.requestId/);
assert.match(entry,/parentGuestToken: previous\.guestToken/);
assert.match(entry,/followUp: "continue"/);
assert.match(entry,/delivery\.source !== "governed"/);
assert.match(entry,/const selectedResult = evolvingCrystalResultIndex\(choices\)/,
  "The Tree must reveal the recorded evolving result without a chooser");
assert.match(entry,/revealGovernedChoice\(selectedResult, false\)/,
  "Present the real result automatically and do not duplicate receipt writes");
assert.doesNotMatch(entry,/Tell me which pathway to enter\./,
  "No obsolete spoken four-pathway menu on the current one-result screen");
assert.match(entry,/reconcileCrystalMedia\(older, newer\)/);
assert.match(entry,/governedAuth\.current\?\.requestId !== authorized\.requestId/,
  "Only the same authorized original run can hydrate a delivered GLB");
assert.match(entry,/setGovernedMediaPending\(crystalHasPendingModels\(choices\)\)/);
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
const smoke=readFileSync(".github/workflows/ascension-live-answer-smoke.yml","utf8");
assert.match(smoke,/tests\/ascension-live-engage\.mjs/,
  "Only the actual approved Tree/Library Card live acceptance can declare V1 complete");
assert.doesNotMatch(smoke,/structured-four-20261028|phase.*initial|\/api\/public\/ascension\/independent/,
  "The obsolete pre-Tree answer endpoint cannot certify V1");
assert.doesNotMatch(smoke,/flyctl|FLY_API_TOKEN|superfly\//i,
  "Live V1 acceptance may never use Fly credentials or CLI after disconnection");
assert.match(smoke,/Fly\/internal hosts are disconnected by the owner/,
  "Reject retired Fly hosts rather than connecting to them");
console.log("PASS: one owner-approved evolving result, genuine provider provenance saved, no selection menu or automatic disclosure");
