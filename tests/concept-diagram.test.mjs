import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true } });
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
try {
  const { deriveConceptParts, buildConceptDiagram, explodeConcept } = await server.ssrLoadModule('/src/lib/ascension/concept-diagram.ts');
  const pathway = { id:'coil', label:'Moving magnet experiment', summary:'Measure electromagnetic induction in a coil.', steps:['Move the magnet through the coil', 'Compare induced voltage at different speeds', 'Reverse motion to test Lenz’s law'], tradeoffs:['Meter response limits resolution'], model_spec:null, model_url:null };
  const parts = deriveConceptParts('Explain electromagnetic induction with a coil and moving magnet', pathway);
  const group = buildConceptDiagram(parts, {structure:'gold', energy:'cyan'});
  check('null GLB produces bounded visible 3D concept geometry', () => { assert.equal(group.children.length, 3); assert.equal(new THREE.Box3().setFromObject(group).isEmpty(), false); group.children.forEach(mesh => assert.ok(mesh.geometry.attributes.position.count > 0)); });
  check('named concept elements are grounded in selected pathway, not stock rooms', () => { assert.deepEqual(parts.map(part => part.name), pathway.steps); assert.ok(parts.every(part => part.limitations.includes('unverified'))); assert.doesNotMatch(JSON.stringify(parts), /bedroom|bathroom|desk|motor/i); });
  check('pathways derive materially different semantic elements', () => { const other = deriveConceptParts('Induction', {...pathway, steps:['Compare 100 and 500 coil turns']}); assert.notDeepEqual(other.map(part => part.name), parts.map(part => part.name)); });
  check('exploded dissection separates components and restores user-edited positions', () => { const saved = new Map(); group.children[0].position.x += 0.4; const before = group.children.map(mesh => mesh.position.clone()); explodeConcept(group,true,saved); assert.ok(group.children[0].position.distanceTo(before[0]) > 0); explodeConcept(group,true,saved); explodeConcept(group,false,saved); group.children.forEach((mesh,index) => assert.ok(mesh.position.distanceTo(before[index]) < 1e-8)); });
  check('supplied model semantics take precedence, without fabricated construction', () => { const specified = deriveConceptParts('Engine', {...pathway, model_spec:{parts:[{name:'Provided coil'}],description:'Provided design data'}}); assert.equal(specified[0].name,'Provided coil'); assert.match(specified[0].connections,/physical connections are unavailable/); });
  const viewer=readFileSync('src/components/ascension/RealityViewer.tsx','utf8');
  check('GLB path still parses actual downloaded models', () => { assert.match(viewer,/fetch\(loadedUrl/); assert.match(viewer,/GLTFLoader\(\)\.parseAsync/); assert.match(viewer,/model = gltf.scene/); });
  check('concept controls are no longer blocked by absent model_url', () => { assert.doesNotMatch(viewer,/if \(!pathway.model_url\)/); assert.match(viewer,/setReady\(true\)/); assert.match(viewer,/explode\(dissected\)/); });
  check('model arrival protects edited assemblies', () => { assert.match(viewer,/if \(!edited.current && pathway.model_url\)/); assert.match(viewer,/REPLACE EDITED CONCEPT WITH HUNYUAN MODEL/); });
  check('mobile controls remain separate visible grid items', () => { const css=readFileSync('src/components/ascension/reality-viewer.css','utf8'); assert.match(css,/\.reality-view-controls[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/); for (const control of ['BLUEPRINT','DISSECTED','PARTS']) assert.ok(viewer.includes(control)); });
  console.log(`${passed} concept restoration checks passed`);
} finally { await server.close(); }