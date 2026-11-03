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

const {parseDesignRegions}=await module('src/lib/ascension/design-regions.ts');
const square=[[.1,.1],[.3,.1],[.3,.3],[.1,.3]];
assert.equal(parseDesignRegions({regions:[{part:0,confidence:.95,polygon:square}]},2).length,1);
for(const region of [{part:5,confidence:.95,polygon:square},{part:0,confidence:.5,polygon:square},{part:0,confidence:.95,polygon:[[0,0],[1,0],[1,1],[0,1]]},{part:0,confidence:.95,polygon:[[NaN,0],[.5,0],[.5,.5]]}])
 assert.equal(parseDesignRegions({regions:[region]},2).length,0,'Reject unsupported, uncertain, nonfinite or whole-object regions');
console.log('PASS image region validation: source indexes, confidence, finite coordinates and bounded area');
