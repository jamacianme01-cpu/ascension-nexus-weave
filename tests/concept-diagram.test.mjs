import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createServer } from 'vite';

function readStylesheet(path) {
  const css = readFileSync(path, 'utf8');
  const dir = path.slice(0, path.lastIndexOf('/'));
  return css.replace(/@import\s+["']\.\/([^"']+)["'];/g, (_, file) => readFileSync(`${dir}/${file}`, 'utf8'));
}
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
  const fid={...(await server.ssrLoadModule('/src/lib/ascension/spec-fidelity.ts')),assemblyStatus:(await server.ssrLoadModule('/src/lib/ascension/canonical-assembly.ts')).assemblyStatus};
  const richSpec={...model_spec,parts:[...model_spec.parts,{name:'Coil housings',primitive:'box',position:[0,-.5,0],rotation:[0,0,0],scale:[.9,.1,.4],material:'steel'},{name:'Support rails',primitive:'box',position:[0,.5,0],rotation:[0,0,0],scale:[1.4,.05,.05],material:'blue'}]};
  check('supplied semantic shapes with adequate coverage take precedence over historical fallback',()=>{const a=canonicalAssembly('Engine',{...engine,model_spec:richSpec}); assert.equal(a.length,4); assert.deepEqual(a.map(p=>p.detail.name),['Copper coil','Moving magnet','Coil housings','Support rails']);});
  check('incomplete two-primitive spec is never shown as a finished subject',()=>{const {specFidelity,assemblyStatus}=fid; const drone={id:'d',label:'Hybrid Industrial Manipulator',summary:'Worker drone',steps:['Build a heavy-lift hexacopter frame','Mount a 3-DOF robot arm','Add swarm communications','Integrate flight controller'],tradeoffs:[],model_spec:{...model_spec,parts:[{name:'main_chassis',primitive:'box',position:[0,0,0],rotation:[0,0,0],scale:[.5,.2,.5],material:'steel'},{name:'arm_assembly',primitive:'cylinder',position:[.5,0,0],rotation:[0,0,0],scale:[.6,.1,.1],material:'gold'}]},model_url:null}; const f=specFidelity(drone); assert.equal(f.status,'incomplete'); assert.ok(f.missing.length>=2); assert.equal(assemblyStatus('make worker drones',drone),'incomplete'); const a=canonicalAssembly('make worker drones',drone); assert.ok(!a.some(p=>/main_chassis|arm_assembly/.test(p.detail.name))); assert.deepEqual(a.map(p=>p.detail.name),drone.steps); const good={...drone,model_spec:{...model_spec,parts:['Hexacopter frame','Rotor arm 1','Rotor arm 2','Robot arm (3-DOF)','Swarm communications antenna','Flight controller board'].map((name,i)=>({name,primitive:i%2?'cylinder':'box',position:[i*.2,0,0],rotation:[0,0,0],scale:[.2,.2,.2],material:'steel'}))}}; assert.equal(specFidelity(good).status,'complete'); assert.equal(canonicalAssembly('make worker drones',good).length,6);});
  const {parseDelivery}=await server.ssrLoadModule('/src/lib/ascension/result-model.ts');
  check('parser preserves validated pathway and blend specs and caps parts at 32',()=>{const raw={kind:'answer',title:'Experiment',body:'A moving magnet changes flux through a coil.',files:[],limitations:[],pathways:[{...pathway,model_spec:{...model_spec,parts:Array(40).fill(model_spec.parts[0])}}],blend:{...pathway,id:'blend',model_spec,blend_from:['coil'],blend_reason:'Combine supplied coil and magnet observations'}};const parsed=parseDelivery(raw);assert.equal(parsed.pathways[0].model_spec.parts.length,32);assert.equal(parsed.blend.model_spec.parts.length,2);const invalid=parseDelivery({...raw,pathways:[{...pathway,model_spec:{...model_spec,parts:[model_spec.parts[0]]}}]});assert.equal(invalid.pathways[0].model_spec,null);});
  check('governed pathway preserves only delivered component purpose and location',()=>{
    const raw={kind:'answer',title:'Coil study',body:'Inspect moving magnet and coil.',files:[],limitations:[],
      pathways:[{...pathway,model_spec:{...model_spec,parts:[
        {...model_spec.parts[0],purpose:'Induces a measurable voltage',location:'Around the magnet travel path'},
        {...model_spec.parts[1]}]} }],blend:null};
    const parsed=parseDelivery(raw);
    assert.equal(parsed.pathways[0].model_spec.parts[0].purpose,'Induces a measurable voltage');
    assert.equal(parsed.pathways[0].model_spec.parts[0].location,'Around the magnet travel path');
    assert.equal(parsed.pathways[0].model_spec.parts[1].purpose,'');
    assert.equal(parsed.pathways[0].model_spec.parts[1].location,'');
  });
  check('current inspection uses delivered models and the separate component list',()=> {
    const scene=readFileSync('src/components/ascension/crystal-experience.tsx','utf8');
    const viewport=readFileSync('src/components/ascension/v1-design-viewport.tsx','utf8');
    const surface=readFileSync('src/components/ascension/crystal-surface.tsx','utf8');
    assert.match(scene,/ascension-exact-approved-scene\.png/);
    assert.match(viewport,/new GLTFLoader\(\)\.load\(modelUrl/);
    assert.match(viewport,/OrbitControls/);
    assert.match(surface,/ascension-crystal-components/);
    for(const field of ['What','Where','Does']) assert.ok(surface.includes('<dt>'+field+'</dt>'));
    assert.doesNotMatch(scene,/RealityViewer|Envision3DScene|ENTER PATHWAY/);
  });
  const {demonstrationPhases,demonstrationFrame,zoomImage,fitImage,groundedComponent}=await server.ssrLoadModule('/src/components/ascension/reality-demonstration.ts');
  check('four unlike inquiries retain actual pathway steps without example branches',()=>{
    for(const steps of [['Charge battery','Power sensor','Read sensor'],['Parse source','Compile module','Run tests'],['Mix pigment','Apply brush strokes','Dry painted layer'],['Read evidence','Compare accounts','Explain historical causes']]){
      const phases=demonstrationPhases({...pathway,steps},[]);assert.deepEqual(phases.map(p=>p.caption),steps);
    }
    assert.deepEqual(demonstrationPhases({...pathway,steps:[]},[]),[]);
  });
  check('12 second timeline is bounded and scrub selects correct phase',()=>{assert.deepEqual(demonstrationFrame(6,3),{index:1,progress:.5});assert.deepEqual(demonstrationFrame(15,3),{index:2,progress:1});});
  check('image fit letterboxes landscape and square without narrow-strip constraints',()=>{assert.deepEqual(fitImage(1200,600,1600,900),{width:1066.6666666666665,height:600,x:66.66666666666674,y:0});assert.equal(fitImage(390,450,1024,1024).width,390);});
  check('zoom preserves pointer anchored image coordinates and caps scale',()=>{const a={x:0,y:0,zoom:1};const b=zoomImage(a,2,300,200);assert.equal((300-b.x)/b.zoom,300);assert.equal((200-b.y)/b.zoom,200);assert.equal(zoomImage(a,20,0,0).zoom,6);});
  check('picture mapping requires unique named semantic evidence not an arbitrary mesh name',()=>{assert.equal(groundedComponent('Coil',[{id:'x',name:'Coil',detail:null}]),null);assert.equal(groundedComponent('Copper coil',[{id:'a',name:'Mesh',detail:{...parts[0],name:'Copper coil'}}]).id,'a');assert.equal(groundedComponent('Copper coil',[{id:'a',name:'Coil',detail:{...parts[0],name:'Copper coil'}},{id:'b',name:'Coil',detail:{...parts[0],name:'Copper coil'}}]),null);});
  console.log(`${passed} concept restoration checks passed`);
} finally { await server.close(); }