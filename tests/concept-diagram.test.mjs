import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true } });
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
try {
  const { assemblyParts: deriveConceptParts, buildCanonicalAssembly, explodeAssembly: explodeConcept, canonicalAssembly, pathwayKind } = await server.ssrLoadModule('/src/lib/ascension/canonical-assembly.ts');
  const pathway = { id:'coil', label:'Moving magnet experiment', summary:'Measure electromagnetic induction in a coil.', steps:['Move the magnet through the coil', 'Compare induced voltage at different speeds', 'Reverse motion to test Lenz’s law'], tradeoffs:['Meter response limits resolution'], model_spec:null, model_url:null };
  const parts = deriveConceptParts('Explain electromagnetic induction with a coil and moving magnet', pathway);
  const group = buildCanonicalAssembly('Explain electromagnetic induction with a coil and moving magnet', pathway);
  check('null GLB produces bounded visible 3D concept geometry', () => { assert.equal(group.children.length, 3); assert.equal(new THREE.Box3().setFromObject(group).isEmpty(), false); group.children.forEach(mesh => assert.ok(mesh.geometry.attributes.position.count > 0)); });
  check('named concept elements are grounded in selected pathway, not stock rooms', () => { assert.deepEqual(parts.map(part => part.name), pathway.steps); assert.ok(parts.every(part => part.limitations.includes('UNVERIFIED'))); assert.doesNotMatch(JSON.stringify(parts), /bedroom|bathroom|desk|motor/i); });
  check('pathways derive materially different semantic elements', () => { const other = deriveConceptParts('Induction', {...pathway, steps:['Compare 100 and 500 coil turns']}); assert.notDeepEqual(other.map(part => part.name), parts.map(part => part.name)); });
  check('exploded dissection separates components and restores user-edited positions', () => { const saved = new Map(); group.children[0].position.x += 0.4; const before = group.children.map(mesh => mesh.position.clone()); explodeConcept(group,true,saved); assert.ok(group.children[0].position.distanceTo(before[0]) > 0); explodeConcept(group,true,saved); explodeConcept(group,false,saved); group.children.forEach((mesh,index) => assert.ok(mesh.position.distanceTo(before[index]) < 1e-8)); });
  const engine = {...pathway, label:'Linear propulsion engine', summary:'Three coil housings and support rails', steps:['Inspect coils','Inspect rails']};
  check('historical linear engine restores object-shaped coil winding and rail assembly',()=>{const assembly=canonicalAssembly('Draw a 48 V linear propulsion engine with 9 coils and 3 rails',engine); assert.ok(assembly.length>30); assert.ok(assembly.some(p=>p.detail.name.includes('Copper winding'))); assert.ok(assembly.some(p=>p.vertices.length>1000)); const g=buildCanonicalAssembly('Linear propulsion engine',engine); assert.ok(new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).x>2);});
  check('unknown linear wording does not falsely classify a physical engine',()=>{assert.equal(pathwayKind({...pathway,label:'Linear reasoning for a community'},'Explain logic'),'generic'); assert.equal(pathwayKind(pathway,'Explain electromagnetic induction'),'generic');});
  const model_spec={title:'Coil and moving magnet',description:'CONCEPT / UNVERIFIED coil experiment',hero_rotation:[0,0,0],hero_scale:1,parts:[{name:'Copper coil',primitive:'ring',position:[0,0,0],rotation:[0,Math.PI/2,0],scale:[.6,.6,.6],material:'copper'},{name:'Moving magnet',primitive:'cylinder',position:[.9,0,0],rotation:[0,0,0],scale:[.8,.18,.18],material:'blue'}]};
  check('supplied semantic shapes take precedence over historical engine fallback',()=>{const specified={...engine,model_spec}; const a=canonicalAssembly('Engine',specified); assert.equal(a.length,2); assert.deepEqual(a.map(p=>p.detail.name),['Copper coil','Moving magnet']); assert.notEqual(a[0].vertices.length,a[1].vertices.length);});
  const {parseDelivery}=await server.ssrLoadModule('/src/lib/ascension/result-model.ts');
  check('parser preserves validated pathway and blend specs and caps parts at 32',()=>{const raw={kind:'answer',title:'Experiment',body:'A moving magnet changes flux through a coil.',files:[],limitations:[],pathways:[{...pathway,model_spec:{...model_spec,parts:Array(40).fill(model_spec.parts[0])}}],blend:{...pathway,id:'blend',model_spec,blend_from:['coil'],blend_reason:'Combine supplied coil and magnet observations'}};const parsed=parseDelivery(raw);assert.equal(parsed.pathways[0].model_spec.parts.length,32);assert.equal(parsed.blend.model_spec.parts.length,2);const invalid=parseDelivery({...raw,pathways:[{...pathway,model_spec:{...model_spec,parts:[model_spec.parts[0]]}}]});assert.equal(invalid.pathways[0].model_spec,null);});
  check('approved immersive entry has no rejected top hologram; original geometry remains available',()=>{const scene=readFileSync('src/components/ascension/Envision3DScene.tsx','utf8');const engage=readFileSync('src/components/ascension/engage.tsx','utf8');assert.doesNotMatch(engage,/<Envision3DScene delivery=/);assert.match(engage,/<RealityViewer/);assert.match(engage,/onInspect={inspectPathwayReality}/);assert.doesNotMatch(scene,/if \(!modelViewActive\) return/);assert.match(scene,/assemblyCache.get/);assert.match(scene,/setVisualMode\(m\)/);assert.doesNotMatch(readFileSync('src/components/ascension/RealityViewer.tsx','utf8'),/buildConceptDiagram|concept-diagram/);});
  const viewer=readFileSync('src/components/ascension/RealityViewer.tsx','utf8');
  check('GLB path still parses actual downloaded models', () => { assert.match(viewer,/fetch\(loadedUrl/); assert.match(viewer,/GLTFLoader\(\)\.parseAsync/); assert.match(viewer,/model = gltf.scene/); });
  check('concept controls are no longer blocked by absent model_url', () => { assert.doesNotMatch(viewer,/if \(!pathway.model_url\)/); assert.match(viewer,/setReady\(true\)/); assert.match(viewer,/explode\(dissected\)/); });
  check('model arrival protects edited assemblies', () => { assert.match(viewer,/if \(!edited.current && pathway.model_url\)/); assert.match(viewer,/REPLACE EDITED CONCEPT WITH HUNYUAN MODEL/); });
  check('all approved views are visible in full-screen editor on mobile', () => { const css=readFileSync('src/components/ascension/reality-viewer.css','utf8'); assert.match(css,/\.reality-view-controls[\s\S]*repeat\(6, minmax\(0, 1fr\)\)/); assert.match(css,/\.reality-view-controls \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/); for (const control of ['CUTAWAY','BLUEPRINT','ENVIRONMENT','DISSECTED','PARTS']) assert.ok(viewer.includes(control)); assert.match(viewer,/setMode\("environment"\)/); });
  check('part labels are clickable on the model picture for concepts and real GLBs', () => { assert.match(viewer,/!conceptual && showParts && !dissected/); assert.match(viewer,/aria-label="Labels on the model"/); assert.match(viewer,/api.current\?\.locatePart\(index\)/); });
  check('DISSECTED generates a distinct labeled illustration even before Hunyuan GLB exists', () => {
    assert.match(viewer, /if \(!dissected \|\| !ready \|\| !api\.current \|\| dissection\) return/);
    assert.doesNotMatch(viewer, /if \(!dissected[^\n]*conceptual\) return/);
    assert.match(viewer, /getDissectedDesign\(/);
    assert.match(viewer, /dissected && dissection && <div className="reality-dissection"/);
    assert.match(viewer, /<img src=\{dissection\.imageUrl\}/);
    assert.match(viewer, /dissected && dissection \? dissection\.parts : conceptual/);
  });
  check('Clicking picture label shows its specific explanation, highlights it and enables 3D manipulation', () => {
    assert.match(viewer, /onClick=\{\(\)=>\{setPartIndex\(index\);setShowParts\(true\);\}\}/);
    assert.match(viewer, /reality-dissection-target/);
    assert.match(viewer, /MANIPULATE THIS PART IN 3D/);
    assert.match(viewer, /setEditorOpen\(true\)/);
    assert.match(viewer, /api\.current\?\.selectComponent\(matching\.id\)/);
    for (const detail of ['Purpose', 'How it works', 'Connections', 'Design limits']) assert.ok(viewer.includes(detail));
  });
  check('Generated picture hides the original assembly without removing the preserved 3D editor', () => {
    assert.match(viewer, /visibility:dissected && dissection \? "hidden" : "visible"/);
    assert.match(viewer, /if \(conceptual && ready\) api\.current\?\.explode\(false\)/);
    assert.match(viewer, /!dissected && <div className="reality-component-workbench"/);
    assert.match(readFileSync('src/components/ascension/reality-viewer.css','utf8'), /\.reality-dissection-label\[aria-pressed="true"\]/);
  });
  console.log(`${passed} concept restoration checks passed`);
} finally { await server.close(); }