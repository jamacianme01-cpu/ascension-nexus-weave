import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source=readFileSync(new URL("../src/lib/ascension/design-image-brief.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {compileSelectedPathwayDesign,clipTokenEstimate}=
  await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const cases=[
  {
    objective:"Design a dual round-port subwoofer enclosure",
    title:"Ported subwoofer cabinet",
    parts:[
      {name:"15-inch woofer",purpose:"Reproduce bass",location:"Front panel"},
      {name:"Two 6-inch round ports",purpose:"Tune bass response",location:"Top face"},
      {name:"Internal bracing",purpose:"Strengthen cabinet",location:"Inside enclosure"},
    ],
    summary:"A single cabinet with an exposed woofer and two round top ports.",
    visible:["15-inch woofer at Front panel","Two 6-inch round ports at Top face"],
    absent:["Internal bracing at Inside enclosure"],
    subject:"Ported subwoofer cabinet",
  },
  {
    objective:"Create a compact monitoring box for a bedroom",
    title:"Passive room monitoring enclosure",
    parts:[
      {name:"Thermal window",purpose:"Sense heat",location:"Front surface"},
      {name:"Speaker grille",purpose:"Voice check-in",location:"Right side"},
      {name:"Battery backup",purpose:"Power during outages",location:"Internal tray"},
    ],
    summary:"One wall-mounted monitoring device.",
    visible:["Thermal window at Front surface","Speaker grille at Right side"],
    absent:["Battery backup at Internal tray"],
    subject:"Passive room monitoring enclosure",
  },
  {
    objective:"Invent climate-control clothing",
    title:"Wearable temperature-regulating jacket",
    parts:[
      {name:"Air vents",purpose:"Distribute air",location:"On the outer sleeves"},
      {name:"Control pad",purpose:"Select comfort",location:"Left cuff"},
      {name:"Microcontroller",purpose:"Temperature control",location:"Inside lining"},
    ],
    summary:"A jacket with integrated ventilation.",
    visible:["Air vents at On the outer sleeves","Control pad at Left cuff"],
    absent:["Microcontroller at Inside lining"],
    subject:"Wearable temperature-regulating jacket",
  },
  {
    objective:"Design a linear propulsion machine",
    title:"Electromagnetic rail propulsion engine",
    parts:[
      {name:"Sliding carriage",purpose:"Moves the payload",location:"Top rail surface"},
      {name:"Rail stator",purpose:"Creates a field",location:"Inside rail base"},
    ],
    summary:"A single electromagnetic linear propulsion mechanism.",
    visible:["Sliding carriage at Top rail surface"],
    absent:["Rail stator at Inside rail base"],
    subject:"Electromagnetic rail propulsion engine",
  },
  {
    objective:"Build a garden bookshelf",
    title:"Modular wall bookshelf",
    parts:[
      {name:"Two side brackets",purpose:"Support shelves",location:"Outer left and right sides"},
      {name:"Shelves",purpose:"Hold books",location:"Front face"},
    ],
    summary:"A complete wall-mounted bookshelf.",
    visible:["Two side brackets at Outer left and right sides","Shelves at Front face"],
    absent:[],
    subject:"Modular wall bookshelf",
  },
  {
    objective:"Design a solar charging station",
    title:"Portable solar charging cabinet",
    parts:[
      {name:"Solar panel",purpose:"Generate electricity",location:"Top face"},
      {name:"Battery",purpose:"Store electricity",location:"Inside casing"},
    ],
    summary:"A complete portable electrical power station.",
    visible:["Solar panel at Top face"],
    absent:["Battery at Inside casing"],
    subject:"Portable solar charging cabinet",
  },
  {
    objective:"Make worker drones",
    title:"Hexacopter Worker Drone",
    parts:[
      {name:"Camera",purpose:"Observation",location:"Front fuselage"},
      {name:"Gripper",purpose:"Manipulate objects",location:"Underside"},
    ],
    summary:"Single flying worker machine with six rotors.",
    visible:["Camera at Front fuselage","Gripper at Underside"],
    absent:[],
    subject:"Hexacopter Worker Drone",
  },
];
for(const entry of cases){
  const spec=compileSelectedPathwayDesign(entry.objective,entry.title,entry.parts,entry.summary);
  assert.equal(spec.subject,entry.subject,entry.title+" must stay the selected invention");
  assert.deepEqual(spec.parts,entry.parts,"Parts shown must come from the same selected pathway");
  for(const visible of entry.visible)
    assert.ok(spec.visibleAssemblies.includes(visible),entry.title+": missing "+visible);
  for(const hidden of entry.absent)
    assert.ok(!spec.visibleAssemblies.includes(hidden),entry.title+": hidden part treated as visible "+hidden);
  assert.match(spec.prompt,/one single machine only|exactly three identical copies of one machine/i);
  assert.doesNotMatch(spec.prompt,/remote control|controller|charging base/i);
  assert.match(spec.prompt,/neutral gray studio background/i);
  assert.ok(clipTokenEstimate(spec.prompt)<=72,entry.title+": prompt exceeds legacy free provider token limit: "+spec.prompt);
  assert.ok(spec.negative.length>30,entry.title);
}
for(const entry of cases.filter(c=>!/drone/i.test(c.title))){
  const spec=compileSelectedPathwayDesign(entry.objective,entry.title,entry.parts,entry.summary);
  assert.doesNotMatch(spec.prompt,/drone|hexacopter|quadcopter|rotor unit|gripper attached to fuselage/i,
    "Non-drone inventions must never acquire drone parts: "+entry.title);
}
const original=cases[0];
// A generic pathway title must not erase who the invention is intended to help.
const careObjective="Make a helper drone for people with dementia";
const care=compileSelectedPathwayDesign(careObjective,"Camera Drone",[
  {name:"Speaker",purpose:"Spoken orientation guidance",location:"Front"},
  {name:"Camera",purpose:"Sense surroundings",location:"Top"},
],"A flying helper with memory and orientation support.");
assert.ok(care.prompt.toLowerCase().includes("helper drone"));
assert.doesNotMatch(care.prompt,/Speaker at Front|controller|remote/i);
const underneath=compileSelectedPathwayDesign(careObjective,"Companion Drone",[
  {name:"Environmental Sensors",purpose:"Sense surroundings",location:"Underneath drone body"},
]);
assert.doesNotMatch(underneath.prompt,/Environmental Sensors|controller|remote/i);
const revisedCare=compileSelectedPathwayDesign(careObjective+"\nBuild on the selected pathway: Camera Drone\nPreserve these features: memory support",
  "Camera Drone",[],"A flying helper.");
assert.match(revisedCare.prompt,/helper drone/i);
assert.doesNotMatch(revisedCare.prompt,/Preserve these features|Build on the selected pathway/);
for(const entry of cases){
  const prompt=compileSelectedPathwayDesign(entry.objective,entry.title,entry.parts,entry.summary).prompt.toLowerCase();
  assert.doesNotMatch(prompt,/remote control|handset|charging base|product lineup/);
  assert.match(prompt,/one single machine only/);
}
const changed=compileSelectedPathwayDesign(original.objective,original.title,
  original.parts.filter(p=>p.name!=="Two 6-inch round ports"),original.summary);
assert.doesNotMatch(changed.prompt,/two 6-inch round ports/i,"Removed hardware must not stay in the picture brief");
const group=compileSelectedPathwayDesign(
  "Design a fleet of monitoring robots","Coordinated monitoring robot fleet",[],
  "Several matching monitoring robots share tasks.");
assert.equal(group.count,3);
assert.match(group.prompt,/exactly three identical copies of one machine/i);

// Distinct selected mechanisms must survive free-image prompt compilation
// without replacing a named exterior part or the original purpose.
const distinctA=compileSelectedPathwayDesign("Make helper drones for people with dementia",
  "Companion worker drone",
  [{name:"Speaker",purpose:"Spoken orientation",location:"Front body"}],
  "Six-rotor aerial helper for spoken orientation in the home.");
const distinctB=compileSelectedPathwayDesign("Make helper drones for people with dementia",
  "Companion worker drone",
  [{name:"Speaker",purpose:"Spoken orientation",location:"Front body"}],
  "Aerial assistance with distinctive landing and approach mechanism.");
assert.match(distinctA.prompt,/helper drone/i);
assert.doesNotMatch(distinctA.prompt,/Speaker|controller|remote|charging/i);
assert.ok(clipTokenEstimate(distinctA.prompt)<=68,"Free image engine must not lose the design to token truncation");

// All owner-specified exterior components must survive prompt preparation.
const fourParts=["Lens","Indicator","Hatch","Antenna"].map((name,i)=>({
  name,purpose:"Assembly function",location:["Front","Top","Left side","Right side"][i],
}));
const detailed=compileSelectedPathwayDesign("Build a monitoring device","Monitor",fourParts);
assert.match(detailed.prompt,/one single machine only/i);
assert.doesNotMatch(detailed.prompt,/Lens at Front|Antenna at Right side|controller|remote/i);
const tooMany=Array.from({length:12},(_,i)=>({
  name:"Exterior assembly module "+i,purpose:"Distinct function "+i,location:"Front side panel",
}));
assert.match(compileSelectedPathwayDesign("Build a device","Monitoring device",tooMany).prompt,/one single machine only/i);
assert.equal(compileSelectedPathwayDesign("Build a device","Monitoring device",tooMany,"",false).parts.length,12,
  "Image provider limits must not crash the parts panel");

const route=readFileSync(new URL("../src/routes/api/public/ascension/independent.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../src/components/ascension/v1-hunyuan-pathway.tsx",import.meta.url),"utf8");
assert.match(route,/compileSelectedPathwayDesign\(objective, title, parts, summary\)/);
assert.match(panel,/compileSelectedPathwayDesign\(objective,path\.title,path\.parts,path\.summary,false\)/);
assert.match(panel,/designParts\.map\(\(p,i\)/);
assert.match(panel,/designParts\[component\]/);
assert.doesNotMatch(route,/generateGrokAssemblyImage|grokImagesEnabled|ASCENSION_ALLOW_GROK_IMAGES/);
assert.doesNotMatch(route,/https:\/\/api\.x\.ai\/v1\/images\/generations/);
console.log("PASS universal ASCENSION invention design: 7 domains, matching parts, no drone bias, no paid Grok image generator");
