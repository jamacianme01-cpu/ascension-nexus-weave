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
}finally{globalThis.fetch=original;}
console.log('PASS vision behavior: named woman voice, shared design identity, separate pathways, cached selection and cancellation');

const {designImageBrief}=await module('src/lib/ascension/design-image-brief.ts');
const brief=designImageBrief('make worker drones','Modular multirotor worker drone',['Airframe','Gripper','Docking and charging station']);
assert.match(brief.prompt,/^One individual unmanned multirotor worker drone/);
assert.doesNotMatch(brief.prompt,/station|people|human|city|fleet/i,'Positive prompt describes the object, not prohibited scene subjects');
assert.match(brief.negative,/people/);assert.match(brief.negative,/city/);
console.log('PASS image brief: subject first, selected mobility, no infrastructure or human cues in the positive prompt');

const {isPersonalFinanceObjective}=await module('src/lib/ascension/objective-experience.ts');
for(const goal of ['I need help with my finances','help me manage my money','I need help paying bills','financial advice','I need help with my finances\nBuild on the selected pathway: Budget plan'])assert.equal(isPersonalFinanceObjective(goal),true,goal);
for(const goal of ['make worker drones','build a personal finance app','design a system to manage my finances','create budgeting software'])assert.equal(isPersonalFinanceObjective(goal),false,goal);
console.log('PASS financial intent: personal guidance stays distinct from explicit product creation');

const {objectiveExperience}=await module('src/lib/ascension/objective-experience.ts');
for(const objective of ['make worker drones','worker drones','design a swarm of drones coordinated by a central controller','build a finance app','make worker drones\nBuild on the selected pathway: Swarm Worker Drones'])assert.equal(objectiveExperience(objective,'guidance'),'design','A wrong provider suggestion cannot hide invention pictures: '+objective);
assert.equal(objectiveExperience('I need help with my finances','design'),'guidance');
console.log('PASS invention routing overrides misclassification while personal finance retains guidance');

const swarmBrief=designImageBrief('make worker drones','Swarm Worker Drones Coordinated via Central Controller',['Multirotor airframe','Communication module','Central controller'],'Multiple aerial worker drones coordinated by a central controller for distributed tasks.');
assert.match(swarmBrief.prompt,/^Three matching unmanned multirotor worker drone/);
assert.match(swarmBrief.prompt,/central controller/);
assert.match(swarmBrief.negative,/wheels/);
assert.doesNotMatch(swarmBrief.negative,/fleet|swarm|multiple objects/,'Do not forbid the selected architecture');
const groundBrief=designImageBrief('make worker drones','Tracked Ground Worker Robot',['Tracked chassis'],'A tracked ground robot for transport.');
assert.match(groundBrief.prompt,/ground worker robot/);assert.doesNotMatch(groundBrief.negative,/wheels/);

assert.match(swarmBrief.prompt,/Exactly three IDENTICAL complete units/,'A real selected swarm must stay a matched fleet, not mixed vehicles');
assert.match(swarmBrief.prompt,/Multiple aerial worker drones coordinated by a central controller/,'The selected pathway summary must reach the image generator');
assert.match(swarmBrief.negative,/collage|montage/,'Reject montage rendering');
const monitoringBrief=designImageBrief(
  'make worker drones',
  'Safety Monitoring Drone with central controller',
  ['High-resolution camera','Microphone array','GPS module','Rechargeable battery'],
  'One multirotor drone observes a room and transmits alerts from a single aircraft.'
);
assert.match(monitoringBrief.prompt,/^One individual unmanned multirotor worker drone/,'A central controller inside one drone is not a swarm');
assert.match(monitoringBrief.prompt,/single aircraft/,'Preserve pathway-specific visual architecture');
assert.match(monitoringBrief.prompt,/same assembly/i,'Components must be integral rather than loose products');
assert.match(monitoringBrief.negative,/duplicate robot|extra machine/,'Reject multiple disconnected aircraft on an individual pathway');
const {briefSpokenAnswer}=await module('src/lib/ascension/spoken-answer.ts');
const spoken=briefSpokenAnswer('This design coordinates work across several drones. It could work well with shared task scheduling. A third sentence is unnecessary.');
assert.equal(spoken,'This design coordinates work across several drones. It could work well with shared task scheduling.');
assert.ok(briefSpokenAnswer('word '.repeat(100)).split(/\s+/).length<=45);
console.log('PASS selected swarm/controller architecture, aerial wheel exclusion, and concise spoken turns');
