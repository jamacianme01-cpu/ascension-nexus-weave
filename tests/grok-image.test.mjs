import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
async function module(path) {
  const text = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // The implementation imports a TS type only, which is erased at runtime.
  return import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
}
const {compileSelectedPathwayDesign} = await module("src/lib/ascension/design-image-brief.ts");
const {grokAssemblyPrompt,grokImagesEnabled,generateGrokAssemblyImage} =
  await module("src/lib/ascension/grok-image.server.ts");

assert.equal(grokImagesEnabled({key:"",allow:"true"}),false,"No key means no paid generation");
assert.equal(grokImagesEnabled({key:"private-test-key",allow:"false"}),false,"No opt-in means no paid generation");
assert.equal(grokImagesEnabled({key:"private-test-key",allow:"true"}),true);

const parts=[
  {name:"Camera",purpose:"Observe the surroundings",location:"Front fuselage"},
  {name:"Robotic gripper",purpose:"Handle objects",location:"Underside"},
  {name:"Battery",purpose:"Supply power",location:"Inside fuselage"},
  {name:"Docking station",purpose:"Recharge the robot",location:"Separate charging base"},
];
const objective="make a worker drone";
const title="Six-rotor worker drone";
const summary="One hexacopter carries a camera and gripper so it can monitor and handle small objects.";
const design=compileSelectedPathwayDesign(objective,title,parts,summary);
const prompt=grokAssemblyPrompt(objective,title,summary,design);
assert.match(prompt,/Six-rotor worker drone/);
assert.match(prompt,/hexacopter|six[- ]rotor/i);
assert.match(prompt,/exactly 6 rotor units/i);
for(const part of parts) assert.ok(prompt.includes(part.name),"Grok must see actual selected part: "+part.name);
assert.match(prompt,/One complete|ONE complete/i);
assert.match(prompt,/no.*separate objects|no.*separate inventions|not.*separate/i);
assert.match(prompt,/Do not invent an additional rotor/i);
assert.match(prompt,/no.*collages/i);
assert.doesNotMatch(prompt,/SDXL|stable diffusion|OVH/i);

let calls=[];
const bytes=Buffer.alloc(5000,4);
bytes[0]=137;bytes[1]=80;bytes[2]=78;bytes[3]=71;
const expected=bytes.toString("base64");
const fake=async (url,init)=>{
  calls.push({url,init,request:JSON.parse(init.body)});
  return new Response(JSON.stringify({data:[{b64_json:expected}]}),{status:200});
};
const result=await generateGrokAssemblyImage(prompt,"private-test-key",fake);
assert.equal(calls.length,1,"Exactly one billed image request, no paid retries");
assert.equal(calls[0].url,"https://api.x.ai/v1/images/generations");
assert.equal(calls[0].request.model,"grok-imagine-image-2.0");
assert.equal(calls[0].request.response_format,"b64_json");
assert.equal(calls[0].request.n,1);
assert.equal(calls[0].request.prompt,prompt);
assert.equal(calls[0].init.headers.authorization,"Bearer private-test-key");
assert.equal(result.imageUrl,"data:image/png;base64,"+expected);
assert.equal(result.bytes.length,bytes.length);

await assert.rejects(generateGrokAssemblyImage(prompt,"",fake),/requires XAI_API_KEY/i);
assert.equal(calls.length,1,"No API request if credentials missing");
await assert.rejects(generateGrokAssemblyImage(prompt,"private-test-key",async()=>new Response(JSON.stringify({data:[{url:"https://imgen.x.ai/temporary.jpg"}]}))),/no usable image bytes/i);
await assert.rejects(generateGrokAssemblyImage(prompt,"private-test-key",async()=>new Response(JSON.stringify({error:"denied"}),{status:401})),/rejected the configured xAI API key/i);

const route=readFileSync(new URL("../src/routes/api/public/ascension/independent.ts",import.meta.url),"utf8");
assert.match(route,/generateGrokAssemblyImage\(prompt, process\.env\["XAI_API_KEY"\]!\)/);
assert.match(route,/compileSelectedPathwayDesign\(objective, title, parts, summary\)/);
assert.match(route,/grokAssemblyPrompt\(objective, title, summary, selected\)/);
assert.doesNotMatch(route,/FREE_SDXL_ENDPOINT|fetchFreeImage|kepler\.ai\.cloud|ASCENSION_IMAGE_ENDPOINT/);
assert.match(route,/ASCENSION_ALLOW_GROK_IMAGES/);
console.log("PASS Grok only image generation: selected assembly, full parts, opt-in, no fallback, one call, no live paid charges");
