import type { Mesh, Vector3 } from "three";
export function measuredPartOffsets(
  meshes: readonly Mesh[], center: Vector3, size: number,
): Vector3[];
export function positionPartAtWorldOffset(
  mesh: Mesh, originalLocalPosition: Vector3, worldOffset: Vector3,
): void;
