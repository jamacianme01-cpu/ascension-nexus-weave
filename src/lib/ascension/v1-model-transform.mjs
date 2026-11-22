import { Box3, Vector3 } from "three";

/**
 * Deterministic measured world-space offsets for a multi-part delivered GLB.
 * This never manufactures new mesh geometry or measurements.
 * @param {import("three").Mesh[]} meshes
 * @param {import("three").Vector3} center
 * @param {number} size
 */
export function measuredPartOffsets(meshes, center, size) {
  const distance=Math.max(size,1e-6)*0.35;
  return meshes.map((mesh,index)=>{
    const partCenter=new Box3().setFromObject(mesh).getCenter(new Vector3());
    const away=partCenter.sub(center);
    if(away.lengthSq()<1e-10) {
      // Multiple delivered meshes sometimes share the same origin. Separate
      // those existing meshes without fabricating replacement components.
      const angle=2*Math.PI*index/Math.max(meshes.length,2);
      away.set(Math.cos(angle), (index%3-1)*0.4, Math.sin(angle));
    }
    return away.normalize().multiplyScalar(distance);
  });
}

/**
 * Move an EXISTING mesh relative to its saved local position, applying a
 * world-space offset correctly even inside rotated/scaled parent groups.
 * @param {import("three").Mesh} mesh
 * @param {import("three").Vector3} originalLocalPosition
 * @param {import("three").Vector3} worldOffset
 */
export function positionPartAtWorldOffset(mesh, originalLocalPosition, worldOffset) {
  const parent=mesh.parent;
  if(!parent) {
    mesh.position.copy(originalLocalPosition).add(worldOffset);
    return;
  }
  parent.updateWorldMatrix(true,false);
  const worldOrigin=parent.localToWorld(originalLocalPosition.clone());
  mesh.position.copy(parent.worldToLocal(worldOrigin.add(worldOffset)));
}
