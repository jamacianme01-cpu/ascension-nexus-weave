import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/lib/ascension/design-image-brief.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { compileSelectedPathwayDesign, clipTokenEstimate } =
  await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));
const parts = [
  { name:"Flight camera", purpose:"Visual observation", location:"Front fuselage" },
  { name:"Robotic gripper", purpose:"Move a small payload", location:"Underside" },
  { name:"Rechargeable battery", purpose:"Onboard power", location:"Inside sealed body" },
  { name:"Docking station", purpose:"Recharge when parked", location:"Separate home base" },
];
const quad = compileSelectedPathwayDesign(
  "make a worker drone for people with dementia",
  "Quadcopter Home Safety Worker Drone",
  parts,
  "Four rotors survey the home for hazards while one gripper handles lightweight objects.",
);
assert.equal(quad.count,1);
assert.equal(quad.rotorCount,4);
assert.deepEqual(quad.parts,parts,"The displayed design parts must come directly from the selected pathway");
assert.match(quad.prompt,/One single quadcopter drone/i);
assert.match(quad.prompt,/exactly 4 rotor units attached to one central airframe/i);
assert.match(quad.prompt,/front-mounted camera built into the same fuselage/i);
assert.match(quad.prompt,/underbody robotic gripper attached to the same fuselage/i);
assert.doesNotMatch(quad.prompt,/docking station|rechargeable battery|separate home base|hazards|dementia/i,
  "Internal components and detached facilities stay in the design record, not as separate rendered objects.");
assert.match(quad.negative,/loose accessories|loose parts/i);
assert.match(quad.negative,/stacked airframes/i);
const hex = compileSelectedPathwayDesign("make a worker drone","Hexacopter Worker Drone",parts,
  "Six-rotor airframe with its own onboard camera.");
assert.equal(hex.rotorCount,6);
assert.match(hex.prompt,/exactly 6 rotor units/i);
assert.doesNotMatch(hex.prompt,/exactly 4 rotor units/i);
const fixed = compileSelectedPathwayDesign("make a drone","Fixed-Wing Drone with Robotic Arm",parts,
  "A long range winged aircraft monitors the home environment.");
assert.equal(fixed.rotorCount,null);
assert.match(fixed.prompt,/fixed-wing unmanned drone/i);
assert.match(fixed.prompt,/two rigid wings joined to one fuselage/i);
assert.doesNotMatch(fixed.prompt,/multirotor|six rotor units|quadrotor/i);
assert.match(fixed.prompt,/gripper attached/i);
const walker = compileSelectedPathwayDesign("make a worker drone","Walking Hexapod Drone",parts,
  "A six-legged ground walker moves over rough terrain.");
assert.equal(walker.rotorCount,null);
assert.match(walker.prompt,/six-legged walking ground robot/i);
assert.match(walker.prompt,/six articulated legs attached to one chassis/i);
assert.doesNotMatch(walker.prompt,/propeller aircraft|multirotor/i);
const monitor = compileSelectedPathwayDesign("make monitoring drones",
  "Safety Monitoring Drone",[
    {name:"Gas sensor",purpose:"Detect leaks",location:"Internal front chassis"},
    {name:"Thermal sensor",purpose:"Detect heat",location:"Body"},
    {name:"Battery",purpose:"Power",location:"Inside body"},
  ],"A single flying drone scans household safety.");
assert.equal(monitor.count,1);
assert.deepEqual(monitor.parts.map(part=>part.name),["Gas sensor","Thermal sensor","Battery"]);
assert.doesNotMatch(monitor.prompt,/gas sensor|thermal sensor|battery|household safety/i,
  "Internal sensors are not falsely shown as located visible hardware.");
const changed = compileSelectedPathwayDesign("make a worker drone","Quadcopter Home Safety Worker Drone",
  parts.filter(part=>part.name!=="Robotic gripper"),"Four rotors survey the home for hazards.");
assert.doesNotMatch(changed.prompt,/gripper/i,"Removed physical parts cannot remain in the picture brief.");
assert.notEqual(quad.prompt,changed.prompt);
for(const spec of [quad,hex,fixed,walker,monitor,changed]){
  assert.ok(clipTokenEstimate(spec.prompt)<=72,spec.prompt);
  assert.ok(spec.prompt.length>45,spec.prompt);
  assert.ok(spec.negative.length>20,spec.negative);
}
const route = readFileSync(new URL("../src/routes/api/public/ascension/independent.ts",import.meta.url),"utf8");
const panel = readFileSync(new URL("../src/components/ascension/v1-hunyuan-pathway.tsx",import.meta.url),"utf8");
assert.match(route,/compileSelectedPathwayDesign\(objective, title, parts, summary\)/);
assert.match(panel,/compileSelectedPathwayDesign\(objective,path\.title,path\.parts,path\.summary\)/);
assert.match(panel,/designParts\.map\(\(p,i\)/);
assert.match(panel,/designParts\[component\]/);
assert.match(panel,/Part has not been found|has not been found in the picture or the 3D model/i);
console.log("PASS selected-pathway design: exact parts, geometry-constrained attached features, and one shared image/panel source.");
