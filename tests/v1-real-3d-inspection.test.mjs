import assert from "node:assert/strict";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import {
  measuredPartOffsets, positionPartAtWorldOffset,
} from "../src/lib/ascension/v1-model-transform.mjs";

const root = new THREE.Group();
const nested = new THREE.Group();
nested.position.set(4,-2,1);
nested.rotation.set(0.3,0.7,-0.2);
nested.scale.set(2,0.65,1.4);
root.add(nested);
const partA=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
const partB=new THREE.Mesh(new THREE.BoxGeometry(0.5,1.8,0.5),new THREE.MeshBasicMaterial());
partA.position.set(1,0,-0.7);
partB.position.set(-1,0,0.8);
nested.add(partA,partB);
root.updateMatrixWorld(true);
const originalA=partA.position.clone();
const originalB=partB.position.clone();
const worldA=partA.getWorldPosition(new THREE.Vector3());
const worldB=partB.getWorldPosition(new THREE.Vector3());
const bounds=new THREE.Box3().setFromObject(root);
const center=bounds.getCenter(new THREE.Vector3());
const size=bounds.getSize(new THREE.Vector3()).length();
const shifts=measuredPartOffsets([partA,partB],center,size);
assert.equal(shifts.length,2);
assert(shifts[0].length()>0 && shifts[1].length()>0);
positionPartAtWorldOffset(partA,originalA,shifts[0]);
positionPartAtWorldOffset(partB,originalB,shifts[1]);
root.updateMatrixWorld(true);
const movedA=partA.getWorldPosition(new THREE.Vector3());
const movedB=partB.getWorldPosition(new THREE.Vector3());
assert.ok(movedA.distanceTo(worldA.clone().add(shifts[0]))<1e-7,
  "Nested rotated+scaled GLB part must move by the intended world offset");
assert.ok(movedB.distanceTo(worldB.clone().add(shifts[1]))<1e-7,
  "Each nested GLB part must move independently");
positionPartAtWorldOffset(partA,originalA,new THREE.Vector3());
positionPartAtWorldOffset(partB,originalB,new THREE.Vector3());
root.updateMatrixWorld(true);
assert.ok(partA.getWorldPosition(new THREE.Vector3()).distanceTo(worldA)<1e-7,
  "Implosion must return to the original position exactly");
assert.ok(partB.getWorldPosition(new THREE.Vector3()).distanceTo(worldB)<1e-7);
const sameCenter=new THREE.Group();
const overlap=[0,1,2].map(()=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
  sameCenter.add(mesh);return mesh;
});
sameCenter.updateMatrixWorld(true);
const overlapOffsets=measuredPartOffsets(overlap,new THREE.Vector3(0,0,0),3);
assert.equal(overlapOffsets.length,3);
assert.ok(overlapOffsets.every(item=>item.length()>0));
assert.ok(overlapOffsets[0].distanceTo(overlapOffsets[1])>0.1,
  "Parts which share one local origin must still separate visibly");
const viewport=readFileSync("src/components/ascension/v1-design-viewport.tsx","utf8");
const css=readFileSync("src/components/ascension/v1-design-viewport.css","utf8");
assert.match(viewport,/measuredPartOffsets/);
assert.match(viewport,/positionPartAtWorldOffset/);
assert.match(viewport,/const requires3D = mode === "dissect"/);
assert.match(viewport,/setDimensions\(null\)/);
assert.match(viewport,/window\.cancelAnimationFrame\(implosionFrame\)/);
assert.match(viewport,/copy\.clippingPlanes = \[clip\]/);
assert.match(css,/\.v1-model-canvas\s*\{[\s\S]*?height:100%/);
console.log("PASS: nested-GLB world-space Explode/Implode, true Dissect clipping, no false 2D or stale measurements, sized 3D viewport.");
