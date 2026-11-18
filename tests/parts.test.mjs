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
  const {callApprovedAnswer}=await server.ssrLoadModule('/src/lib/ascension/engine/approved-answer.server.ts');
  const keys=['ASCENSION_ENABLE_PAID_APIS','ASCENSION_ALLOW_OPENAI_AI','OPENAI_API_KEY'];
  const originalEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const original=globalThis.fetch;
  try {
    for(const key of keys)delete process.env[key];
    let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Unexpected outside provider');};
    await assert.rejects(()=>callApprovedAnswer({system:'Describe visible parts.',user:'Housing',includeInternalKnowledge:false}),/owner-approved/);
    assert.equal(calls,0);
    process.env.ASCENSION_ENABLE_PAID_APIS='true';
    process.env.ASCENSION_ALLOW_OPENAI_AI='true';
    process.env.OPENAI_API_KEY='test-only';
    let sent;
    globalThis.fetch=async(url,init)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');
      sent=JSON.parse(init.body);
      return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({parts:[part]})}]}]}));
    };
    const approved=await callApprovedAnswer({system:'Describe visible parts.',user:'Housing',imageDataUrl:'data:image/jpeg;base64,AAAA',includeInternalKnowledge:false});
    assert.equal(sent.input[0].content[1].type,'input_image');
    assert.equal(sent.input[0].content[1].image_url,'data:image/jpeg;base64,AAAA');
    assert.equal(approved.json.parts[0].name,'Housing');
  }finally{
    globalThis.fetch=original;
    for(const key of keys){if(originalEnv[key]===undefined)delete process.env[key];else process.env[key]=originalEnv[key];}
  }
  console.log('PASS part validation, picture grounding, and anchors after camera movement');
}finally{await server.close();}
