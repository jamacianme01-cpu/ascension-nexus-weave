import assert from 'node:assert/strict';
import { createServer } from 'vite';
import * as THREE from 'three';
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { parseDesignParts } = await server.ssrLoadModule('/src/lib/ascension/parts-model.ts');
  const part = { name: 'Housing', x: 0.5, y: 0.5, purpose: 'Supports the assembly.', location: 'Outer body.', operation: 'Encloses the assembly.', connections: 'Supports internal components.', limitations: 'Material not specified.' };
  assert.equal(parseDesignParts({parts:[part]})[0].name,'Housing');
  assert.throws(()=>parseDesignParts({parts:[{...part,x:2}]}));
  assert.throws(()=>parseDesignParts({parts:[{...part,name:'Diagram A'}]}));
  assert.throws(()=>parseDesignParts({parts:[{...part,name:'B'}]}));
  assert.throws(()=>parseDesignParts({parts:[{...part,operation:''}]}));
  const camera = new THREE.PerspectiveCamera(45,1,0.1,100); camera.position.set(0,0,5); camera.lookAt(0,0,0); camera.updateMatrixWorld();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()); mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0,0),camera.clone());
  const hit=ray.intersectObject(mesh)[0]; assert.ok(hit);
  const anchor=mesh.worldToLocal(hit.point.clone());
  camera.position.set(3,2,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const screen=mesh.localToWorld(anchor.clone()).project(camera);
  const nextRay=new THREE.Raycaster();nextRay.setFromCamera(new THREE.Vector2(screen.x,screen.y),camera);
  assert.ok(nextRay.ray.distanceToPoint(mesh.localToWorld(anchor.clone()))<1e-6);
  const {callZai}=await server.ssrLoadModule('/src/lib/ascension/engine/zai.server.ts');
  const prior=process.env.LOVABLE_API_KEY;const priorOptIn=process.env.ASCENSION_ALLOW_LOVABLE_AI;process.env.LOVABLE_API_KEY='test-only';process.env.ASCENSION_ALLOW_LOVABLE_AI='true';const original=globalThis.fetch;
  let sent;
  globalThis.fetch=async(url,init)=>{
    if(String(url).includes('/chat/completions')){sent=JSON.parse(init.body);return new Response('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify({parts:[part]})}}]})+'\n\ndata: [DONE]\n\n');}
    throw new Error('No internal retrieval in isolated test');
  };
  try {await callZai({system:'Describe visible parts.',user:'Housing',imageDataUrl:'data:image/jpeg;base64,AAAA'});assert.equal(sent.messages[1].content[1].image_url.url,'data:image/jpeg;base64,AAAA');}
  finally{globalThis.fetch=original;if(prior===undefined)delete process.env.LOVABLE_API_KEY;else process.env.LOVABLE_API_KEY=prior;if(priorOptIn===undefined)delete process.env.ASCENSION_ALLOW_LOVABLE_AI;else process.env.ASCENSION_ALLOW_LOVABLE_AI=priorOptIn;}
  console.log('PASS part validation, picture grounding, and anchors after camera movement');
}finally{await server.close();}
