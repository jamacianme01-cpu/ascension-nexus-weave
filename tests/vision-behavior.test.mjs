import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
async function module(path){const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const {selectTreeVoice}=await module('src/lib/ascension/tree-speech.ts');
const voice=(name,lang='en-US')=>({name,lang});
assert.equal(selectTreeVoice([voice('Microsoft David'),voice('Microsoft Zira'),voice('Microsoft Aria Online (Natural)')]).name,'Microsoft Aria Online (Natural)');
assert.equal(selectTreeVoice([voice('Microsoft David')]),null,'Do not substitute an unspecified male voice');
const {loadPathwayVisual}=await module('src/lib/ascension/pathway-visual.ts');
const original=globalThis.fetch;const cache=new Map();const requests=[];
globalThis.fetch=async(_url,init)=>{requests.push(JSON.parse(init.body));return new Response(JSON.stringify({image_url:'data:image/png;base64,'+'A'.repeat(5000)}));};
try{
 const signal=new AbortController().signal;
 const path={id:'rotor',title:'Rotor worker',summary:'A worker design',parts:[],steps:[]};
 const first=loadPathwayVisual('worker bots',path,cache,signal);
 const second=loadPathwayVisual('worker bots',path,cache,signal);
 assert.equal(first,second,'Card and selected design share in-flight generation');
 const image=await first;assert.equal(await second,image);assert.equal(requests.length,1);
 assert.equal(await loadPathwayVisual('worker bots',path,cache,signal),image);assert.equal(requests.length,1,'Returning to a design reuses its reference');
 await loadPathwayVisual('worker bots',{...path,id:'rover',title:'Ground worker'},cache,signal);assert.equal(requests.length,2,'Distinct pathways use distinct generation requests');
 const stopped=new AbortController();stopped.abort();
 await assert.rejects(loadPathwayVisual('cancelled',path,cache,stopped.signal));assert.equal(requests.length,2,'Cancelled queued work must not spend a generation request');
 const changedHardware={...path,parts:[{name:'Camera module',purpose:'Observation',location:'Front chassis'}]};
 await loadPathwayVisual('worker bots',changedHardware,cache,signal);
 assert.equal(requests.length,3,'Changing the physical parts must invalidate the old design picture');
 const changedSteps={...changedHardware,steps:['Replace camera mounting geometry']};
 await loadPathwayVisual('worker bots',changedSteps,cache,signal);
 assert.equal(requests.length,4,'Changing assembly steps must invalidate the old design picture');
}finally{globalThis.fetch=original;}
console.log('PASS vision behavior: named woman voice, shared design identity, separate pathways, cached selection and cancellation');

const {designImageBrief,compileDesignIdentity,clipTokenEstimate}=await module('src/lib/ascension/design-image-brief.ts');
const brief=designImageBrief('make worker drones','Modular multirotor worker drone',['Airframe','Gripper','Docking and charging station']);
assert.match(brief.prompt,/^One single unmanned multirotor worker drone/);
assert.doesNotMatch(brief.prompt,/station|people|human|city|fleet|gripper|airframe/i,'Positive prompt is one machine, not a parts list or scene');
assert.match(brief.negative,/people/);assert.match(brief.negative,/city/);
const dementia=designImageBrief('make worker drones for people with dementia','Modular multirotor worker drone',['Airframe','Gripper']);
assert.match(dementia.prompt,/for people with dementia/,'The user purpose clause reaches the picture request');
assert.match(dementia.prompt,/^One single unmanned multirotor worker drone/);
assert.doesNotMatch(dementia.negative,/\bpeople\b/,'Do not negate a person the user named in the purpose');
assert.match(dementia.negative,/collage/,'Collage rejection stays on when a purpose clause is kept');
const summaryOnly=designImageBrief('make worker drones','Swarm Worker Drones',[],'Multiple drones for people with dementia.');
assert.doesNotMatch(summaryOnly.prompt,/dementia/,'A pathway summary must not supply the purpose clause');
console.log('PASS image brief: subject first, selected mobility, no infrastructure or human cues in the positive prompt');

const {isPersonalFinanceObjective}=await module('src/lib/ascension/objective-experience.ts');
for(const goal of ['I need help with my finances','help me manage my money','I need help paying bills','financial advice','I need help with my finances\nBuild on the selected pathway: Budget plan'])assert.equal(isPersonalFinanceObjective(goal),true,goal);
for(const goal of ['make worker drones','build a personal finance app','design a system to manage my finances','create budgeting software'])assert.equal(isPersonalFinanceObjective(goal),false,goal);
console.log('PASS financial intent: personal guidance stays distinct from explicit product creation');

const {objectiveExperience,revisionDirective,isVisualDesignRequest}=await module('src/lib/ascension/objective-experience.ts');
for(const objective of ['make worker drones','worker drones','design a swarm of drones coordinated by a central controller','build a finance app','make worker drones\nBuild on the selected pathway: Swarm Worker Drones'])assert.equal(objectiveExperience(objective,'guidance'),'design','A wrong provider suggestion cannot hide invention pictures: '+objective);
assert.equal(objectiveExperience('I need help with my finances','design'),'guidance');
assert.equal(objectiveExperience('Design a speaker box for a subwoofer','guidance'),'design');
assert.equal(objectiveExperience('Build a bookshelf','guidance'),'design');
assert.equal(isVisualDesignRequest('Construct a garden gate'), true);
assert.equal(isVisualDesignRequest('I need help with my finances'), false);
console.log('PASS invention routing overrides misclassification while personal finance retains guidance');
assert.equal(revisionDirective('make worker drones'),'');
assert.match(revisionDirective('make worker drones\nBuild on the selected pathway: Swarm Worker Drones\nPreserve these features: three aerial drones\nChange or improve: larger gripper'),/binding architecture/);
console.log('PASS build-on keeps the selected architecture binding');

const swarmBrief=designImageBrief('make worker drones','Swarm Worker Drones Coordinated via Central Controller',['Multirotor airframe','Communication module','Central controller'],'Multiple aerial worker drones coordinated by a central controller for distributed tasks.');
assert.match(swarmBrief.prompt,/^Exactly three identical unmanned multirotor worker drone/);
assert.doesNotMatch(swarmBrief.prompt,/central controller|distributed/i,'Do not paste the summary or a separate controller product into the picture prompt');
assert.match(swarmBrief.negative,/wheels/);
assert.doesNotMatch(swarmBrief.negative,/fleet|swarm|multiple objects/,'Do not forbid the selected architecture');
const groundBrief=designImageBrief('make worker drones','Tracked Ground Worker Robot',['Tracked chassis'],'A tracked ground robot for transport.');
assert.match(groundBrief.prompt,/ground worker robot/);assert.doesNotMatch(groundBrief.negative,/wheels/);

assert.match(swarmBrief.prompt,/one group, single photograph/i,'A real selected swarm stays one group, not mixed vehicles or extra views');
assert.match(swarmBrief.negative,/collage/,'Reject montage rendering');
const monitoringBrief=designImageBrief(
  'make worker drones',
  'Safety Monitoring Drone with central controller',
  ['High-resolution camera','Microphone array','GPS module','Rechargeable battery'],
  'One multirotor drone observes a room and transmits alerts from a single aircraft.'
);
assert.match(monitoringBrief.prompt,/^One single unmanned multirotor worker drone/,'A central controller inside one drone is not a swarm');
assert.doesNotMatch(monitoringBrief.prompt,/room|camera|battery|microphone/i,'Scenery and loose parts must not enter the picture prompt');
assert.match(monitoringBrief.prompt,/one complete assembled machine/i,'The picture asks for one assembly');
assert.match(monitoringBrief.negative,/extra machine/,'Reject multiple disconnected aircraft on an individual pathway');
const nonWorkerSwarm=designImageBrief(
  'design an autonomous drone swarm',
  'Coordinated search drone fleet',
  ['Flight controller','Camera','Charging station'],
  'Several matching drones communicate through a compact central controller.'
);
assert.match(nonWorkerSwarm.prompt,/^Exactly three identical unmanned multirotor drones/,'Drone groups remain groups even when objective omits worker');
assert.doesNotMatch(nonWorkerSwarm.prompt,/Charging station|search/,'Infrastructure and task scenery must not appear as detached products');
assert.match(nonWorkerSwarm.negative,/docking station/,'Exclude external base-station collage subjects');
const contaminated=compileDesignIdentity(
  'make worker drones',
  'Single hexacopter worker drone',
  ['Radio controller','Battery','Dock'],
  'Show three separate product photos of different aircraft plus a game controller on a table.'
);
assert.equal(contaminated.count,1);
assert.match(contaminated.prompt,/^One single unmanned hexacopter worker drone/);
assert.doesNotMatch(contaminated.prompt,/three separate|game controller|table|battery|dock/i);
const coordinated=compileDesignIdentity('make worker drones','Centralized worker drone',['Flight controller'],'One multirotor coordinated by an onboard controller for warehouse tasks.');
assert.equal(coordinated.count,1);
assert.doesNotMatch(coordinated.prompt,/three/i);

for(const sample of [brief,swarmBrief,groundBrief,monitoringBrief,nonWorkerSwarm]){
  assert.ok(sample.prompt.split(/\s+/).length<=64,'Keep the selected design within the short SDXL prompt budget');
  assert.ok(clipTokenEstimate(sample.prompt)<=72,'Keep the whole prompt inside SDXL text-encoder context');
  assert.ok(sample.prompt.length>40,'Preserve a substantive architecture brief');
  assert.ok(sample.negative.length>20,'Keep negative conditioning for collages');
}
assert.match(monitoringBrief.prompt,/One single unmanned multirotor worker drone/,'Critical single-machine specification must not be truncated');
assert.match(swarmBrief.prompt,/Exactly three identical/,'Selected swarm count must be in the first prompt segment');
const {briefSpokenAnswer}=await module('src/lib/ascension/spoken-answer.ts');
const spoken=briefSpokenAnswer('This design coordinates work across several drones. It could work well with shared task scheduling. A third sentence is unnecessary.');
assert.equal(spoken,'This design coordinates work across several drones. It could work well with shared task scheduling.');
assert.ok(briefSpokenAnswer('word '.repeat(100)).split(/\s+/).length<=45);
console.log('PASS selected swarm/controller architecture, aerial wheel exclusion, and concise spoken turns');
