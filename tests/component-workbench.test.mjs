import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true}});
try{
 const {splitMeshIslands,attachComponent}=await server.ssrLoadModule('/src/lib/ascension/component-workbench.ts');
 const geometry=new THREE.BufferGeometry();
 const a=new THREE.BoxGeometry().toNonIndexed(),b=new THREE.BoxGeometry().toNonIndexed();b.translate(3,0,0);
 for(const name of ['position','normal','uv']){const x=a.getAttribute(name),y=b.getAttribute(name);const array=new Float32Array(x.array.length+y.array.length);array.set(x.array);array.set(y.array,x.array.length);geometry.setAttribute(name,new THREE.BufferAttribute(array,x.itemSize));}
 const original=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
 const pieces=splitMeshIslands(original);assert.equal(pieces.length,2);assert.equal(pieces.reduce((sum,p)=>sum+p.geometry.index.count,0),geometry.getAttribute('position').count);
 const scene=new THREE.Scene();const source=pieces[0],target=pieces[1];scene.add(source,target);target.rotation.y=0.4;target.scale.set(2,1.2,0.8);scene.updateMatrixWorld(true);
 const before=source.getWorldScale(new THREE.Vector3());attachComponent(source,target);assert.equal(source.parent.parent,target);const after=source.getWorldScale(new THREE.Vector3());assert.ok(before.distanceTo(after)<1e-6);
 assert.throws(()=>attachComponent(target,source));assert.throws(()=>attachComponent(source,source));
 const solid=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());assert.equal(splitMeshIslands(solid).length,1);
 console.log('PASS disconnected geometry extraction, triangle conservation, transformed-parent attachment, cycles and monolithic model preservation');
}finally{await server.close();}
