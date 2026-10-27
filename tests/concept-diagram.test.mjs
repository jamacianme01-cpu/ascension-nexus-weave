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
  const fid={...(await server.ssrLoadModule('/src/lib/ascension/spec-fidelity.ts')),assemblyStatus:(await server.ssrLoadModule('/src/lib/ascension/canonical-assembly.ts')).assemblyStatus};
  const richSpec={...model_spec,parts:[...model_spec.parts,{name:'Coil housings',primitive:'box',position:[0,-.5,0],rotation:[0,0,0],scale:[.9,.1,.4],material:'steel'},{name:'Support rails',primitive:'box',position:[0,.5,0],rotation:[0,0,0],scale:[1.4,.05,.05],material:'blue'}]};
  check('supplied semantic shapes with adequate coverage take precedence over historical fallback',()=>{const a=canonicalAssembly('Engine',{...engine,model_spec:richSpec}); assert.equal(a.length,4); assert.deepEqual(a.map(p=>p.detail.name),['Copper coil','Moving magnet','Coil housings','Support rails']);});
  check('incomplete two-primitive spec is never shown as a finished subject',()=>{const {specFidelity,assemblyStatus}=fid; const drone={id:'d',label:'Hybrid Industrial Manipulator',summary:'Worker drone',steps:['Build a heavy-lift hexacopter frame','Mount a 3-DOF robot arm','Add swarm communications','Integrate flight controller'],tradeoffs:[],model_spec:{...model_spec,parts:[{name:'main_chassis',primitive:'box',position:[0,0,0],rotation:[0,0,0],scale:[.5,.2,.5],material:'steel'},{name:'arm_assembly',primitive:'cylinder',position:[.5,0,0],rotation:[0,0,0],scale:[.6,.1,.1],material:'gold'}]},model_url:null}; const f=specFidelity(drone); assert.equal(f.status,'incomplete'); assert.ok(f.missing.length>=2); assert.equal(assemblyStatus('make worker drones',drone),'incomplete'); const a=canonicalAssembly('make worker drones',drone); assert.ok(!a.some(p=>/main_chassis|arm_assembly/.test(p.detail.name))); assert.deepEqual(a.map(p=>p.detail.name),drone.steps); const good={...drone,model_spec:{...model_spec,parts:['Hexacopter frame','Rotor arm 1','Rotor arm 2','Robot arm (3-DOF)','Swarm communications antenna','Flight controller board'].map((name,i)=>({name,primitive:i%2?'cylinder':'box',position:[i*.2,0,0],rotation:[0,0,0],scale:[.2,.2,.2],material:'steel'}))}}; assert.equal(specFidelity(good).status,'complete'); assert.equal(canonicalAssembly('make worker drones',good).length,6);});
  const {parseDelivery}=await server.ssrLoadModule('/src/lib/ascension/result-model.ts');
  check('parser preserves validated pathway and blend specs and caps parts at 32',()=>{const raw={kind:'answer',title:'Experiment',body:'A moving magnet changes flux through a coil.',files:[],limitations:[],pathways:[{...pathway,model_spec:{...model_spec,parts:Array(40).fill(model_spec.parts[0])}}],blend:{...pathway,id:'blend',model_spec,blend_from:['coil'],blend_reason:'Combine supplied coil and magnet observations'}};const parsed=parseDelivery(raw);assert.equal(parsed.pathways[0].model_spec.parts.length,32);assert.equal(parsed.blend.model_spec.parts.length,2);const invalid=parseDelivery({...raw,pathways:[{...pathway,model_spec:{...model_spec,parts:[model_spec.parts[0]]}}]});assert.equal(invalid.pathways[0].model_spec,null);});
  check('approved immersive entry has no rejected top hologram; original geometry remains available',()=>{const scene=readFileSync('src/components/ascension/Envision3DScene.tsx','utf8');const engage=readFileSync('src/components/ascension/engage.tsx','utf8');assert.doesNotMatch(engage,/<Envision3DScene delivery=/);assert.match(engage,/<RealityViewer/);assert.match(engage,/onInspect={inspectPathwayReality}/);assert.doesNotMatch(scene,/if \(!modelViewActive\) return/);assert.match(scene,/assemblyCache.get/);assert.match(scene,/setVisualMode\(m\)/);assert.doesNotMatch(readFileSync('src/components/ascension/RealityViewer.tsx','utf8'),/buildConceptDiagram|concept-diagram/);});
  const viewer=readFileSync('src/components/ascension/RealityViewer.tsx','utf8');
  check('GLB path still parses actual downloaded models', () => { assert.match(viewer,/fetch\(loadedUrl/); assert.match(viewer,/GLTFLoader\(\)\.parseAsync/); assert.match(viewer,/model = gltf.scene/); });
  check('concept controls are no longer blocked by absent model_url', () => { assert.doesNotMatch(viewer,/if \(!pathway.model_url\)/); assert.match(viewer,/setReady\(true\)/); assert.match(viewer,/api\.current\?\.explode\(false\)/); });
  check('model arrival protects edited assemblies', () => { assert.match(viewer,/if \(!edited.current && pathway.model_url\)/); assert.match(viewer,/REPLACE EDITED CONCEPT WITH HUNYUAN MODEL/); });
  check('V1 shows the approved Dissect, Exploded, Blueprint and 3D modes on mobile',()=>{
    const css=readFileSync('src/components/ascension/reality-viewer.css','utf8');
    for(const control of ['DISSECT','EXPLODED VIEW','BLUEPRINT','3D VIEW','COMPONENTS'])
      assert.ok(viewer.includes(control), 'missing '+control);
    assert.match(css,/\.reality-screen \.reality-view-controls \{ display:flex/);
    assert.match(css,/@media\(max-width:760px\)/);
    assert.doesNotMatch(viewer,/>\s*CUTAWAY\s*<\/Button>/);
    assert.doesNotMatch(viewer,/>\s*ENVIRONMENT\s*<\/Button>/);
  });
  check('V1 pictures are not cluttered with part markers',()=>{
    const dissection=readFileSync('src/components/ascension/RealityDissection.tsx','utf8');
    assert.doesNotMatch(dissection,/<Button variant="outline" className="reality-dissection-label"/);
    assert.match(viewer,/false && ready && !dissected && showParts/);
    assert.match(viewer,/reality-named-parts/);
    assert.match(viewer,/aria-label="Design parts"/);
  });
  check('assembled reference and source-derived dissection retain honest provenance',()=>{
    assert.match(viewer,/view:"assembled",requestId,pathwayId:pathway\.id/);
    assert.match(viewer,/view:"dissected",\.\.\.\(requestId \? \{requestId\} : \{\}\)/);
    assert.match(viewer,/const referenceImageUrl = sourceReference \?\? assembledImage/);
    assert.match(viewer,/const displayedImageUrl = dissected && dissection \? dissection\.imageUrl : referenceImageUrl/);
    assert.match(viewer,/AWAITING SOURCE-DERIVED 3D MODEL/);
  });
  check('component inspector shows named parts and side descriptions',()=>{
    assert.match(viewer,/reality-named-parts/);
    assert.match(viewer,/setPartIndex\(index\)/);
    assert.match(viewer,/MANIPULATE THIS PART IN 3D/);
    assert.match(viewer,/setEditorOpen\(true\)/);
    for(const detail of ['Purpose','How it works','Connections','Design limits'])assert.ok(viewer.includes(detail));
    assert.match(viewer,/ascension-v1-view-description/);
    assert.match(viewer,/pathway\.summary/);
  });
  check('only ENGAGE and ANSWER play cues; viewer has no continuous ambience', () => {
    const engage=readFileSync('src/components/ascension/engage.tsx','utf8');
    assert.match(engage,/cue !== "engage" && cue !== "eruption"/);
    assert.match(engage,/ctx\.resume\(\)\.then\(emit\)/);
    assert.doesNotMatch(engage,/createRealityAtmosphere\(ctx\)/);
    assert.doesNotMatch(viewer,/realityFeedback\(frame\.index\)/);
    const toggle=engage.slice(engage.indexOf('const toggleSound'),engage.indexOf('const runQuery'));
    assert.match(toggle,/setSoundBlocked\(ctx\.state !== "running"\)/);
  });
  check('Reference image persists beside CAD and Blueprint while 3D editing remains available', () => {
    assert.match(viewer, /<div ref=\{host\} className="reality-viewport"[^>]*aria-label="Editable 3D model/);
    assert.match(viewer, /const referenceImageUrl = sourceReference \?\? assembledImage/);
    assert.match(viewer, /const splitReference = Boolean\(displayedImageUrl\)/);
    assert.match(viewer, /const awaitingFaithfulMesh = Boolean\(conceptual && \(referenceImageUrl \|\| \["queued","claimed","running"\]\.includes\(pathway\.model_status \?\? ""\)\)\)/);
    assert.match(viewer, /data-split=\{splitReference \? "true" : undefined\}/);
    assert.match(viewer, /data-image-only=\{imageOnly \? "true" : undefined\}/);
    assert.match(viewer, /visibility:awaitingFaithfulMesh \? "hidden" : "visible"/);
    assert.match(viewer, /AWAITING SOURCE-DERIVED 3D MODEL/);
    assert.doesNotMatch(viewer.slice(viewer.indexOf('const editIllustratedPart'), viewer.indexOf('const dive = useRef')), /setDissected\(false\)/);
    assert.match(viewer, /<div className="reality-component-workbench">/);
    assert.match(viewer, />ISOLATE</);
    assert.match(viewer, /isolate\(id\)/);
    const css=readFileSync('src/components/ascension/reality-viewer.css','utf8');
    assert.match(css, /data-split="true"\] \.reality-viewport \{ left:50%/);
    assert.match(css, /data-sidebar="open"\] \{ padding-right:min\(380px,32vw\)/);
    assert.match(css, /\.reality-dissection-label\[aria-pressed="true"\]/);
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
  check('image navigation has native wheel pinch drag fit focus and accessible labels',()=>{const image=readFileSync('src/components/ascension/RealityDissection.tsx','utf8');for(const marker of ['passive:false','setPointerCapture','onPointerMove','Focus selected part','Fit illustration','part.purpose','data-x','data-y'])assert.ok(image.includes(marker));});
  check('demonstration exposes playback scrub and causal mesh cues without mutating transforms',()=>{for(const marker of ['CONCEPTUAL DEMONSTRATION · UNVERIFIED','Operational animation unavailable','Demonstration timeline','REPLAY','demoCue.position','demoMaterials.clear()'])assert.ok(viewer.includes(marker));});
  check('sound remains sustained and bounded with feedback and volume control',()=>{const audio=readFileSync('src/components/ascension/reality-audio.ts','utf8');assert.doesNotMatch(audio,/graph.scheduleDim\(12_000\)/);assert.match(audio,/setRealityVolume/);assert.match(audio,/tone.onended/);assert.match(viewer,/Ambient volume/);});
  check('muted feedback cannot resume context or bypass zero volume',()=>{const audio=readFileSync('src/components/ascension/reality-audio.ts','utf8');assert.match(audio,/ctx.state !== 'running'/);assert.match(audio,/realityVolume === 0/);assert.doesNotMatch(audio,/ctx.resume\(/);assert.match(audio,/realityContext = null/);});
  check('SIMULATE click starts playback immediately and the central objective animation is visible',()=>{
    assert.match(viewer,/const start=!simulate;setSimulate\(start\);setPlaying\(start\);setSeconds\(0\)/);
    assert.match(viewer,/if\(start\)\{setDissected\(false\);setShowParts\(false\);\}/);
    assert.match(viewer,/simulate && !dissected && phases.length > 0 && <div className=/);
    assert.match(viewer,/Animated objective operation/);
    assert.match(viewer,/reality-operation-pulse/);
    const css=readFileSync('src/components/ascension/reality-viewer.css','utf8');
    assert.match(css,/\.reality-operation-stage \{/);
    assert.match(css,/@media \(max-width:760px\) \{[\s\S]*\.reality-operation-stage/);
  });
  check('nonphysical demonstrations show the actual pathway rather than unrelated 3D geometry',()=>{assert.match(viewer,/reality-operation-stage\$\{interpretiveDemo \? "" : " reality-operation-stage--with-model"\}/);assert.match(viewer,/CONCEPTUAL OPERATION/);assert.match(viewer,/Current phase progress/);assert.match(viewer,/phases\[frame.index\]\?\.caption/);});
  check('image navigation avoids lower inspector overlap and desktop inspector leaves image room',()=>{const css=readFileSync('src/components/ascension/reality-viewer.css','utf8');assert.match(css,/\.reality-image-tools \{[^}]*top:8px; bottom:auto/);assert.match(css,/\.reality-screen:has\(\.reality-parts\) \.reality-dissection \{ right:414px/);});
  console.log(`${passed} concept restoration checks passed`);
} finally { await server.close(); }