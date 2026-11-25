/** Validate the structure of a generated glTF 2.0 binary, not just 'glTF' magic.
 * A fake 20-byte header or a GLB with no meshes is NOT a delivered 3D design.
 * This is container/geometry-presence validation, not engineering verification.
 */
export function validateGlbGeometry(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 48) return false;
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
        view.getUint32(8, true) !== bytes.byteLength) return false;
    const jsonLength = view.getUint32(12, true);
    const jsonType = view.getUint32(16, true);
    if (jsonType !== 0x4e4f534a || jsonLength < 20 ||
        jsonLength % 4 !== 0 || 20 + jsonLength + 8 > bytes.byteLength) return false;
    const jsonString = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(20, 20 + jsonLength)).trim();
    const gltf = JSON.parse(jsonString);
    if (!gltf || gltf.asset?.version !== "2.0" ||
        !Array.isArray(gltf.meshes) || !gltf.meshes.length ||
        !Array.isArray(gltf.accessors) || !Array.isArray(gltf.bufferViews) ||
        !Array.isArray(gltf.buffers)) return false;
    let hasPositionGeometry = false;
    for (const mesh of gltf.meshes) {
      if (!Array.isArray(mesh?.primitives)) return false;
      for (const primitive of mesh.primitives) {
        const pos = primitive?.attributes?.POSITION;
        if (!Number.isInteger(pos) || pos < 0 || pos >= gltf.accessors.length)
          continue;
        const accessor = gltf.accessors[pos];
        if (accessor?.type !== "VEC3" ||
            !Number.isInteger(accessor.count) || accessor.count < 3 ||
            !Number.isInteger(accessor.bufferView) ||
            accessor.bufferView < 0 || accessor.bufferView >= gltf.bufferViews.length)
          continue;
        const bufferView = gltf.bufferViews[accessor.bufferView];
        if (!Number.isInteger(bufferView?.buffer) || bufferView.buffer < 0 ||
            bufferView.buffer >= gltf.buffers.length ||
            !Number.isInteger(bufferView.byteLength) || bufferView.byteLength < 12)
          continue;
        hasPositionGeometry = true;
      }
    }
    if (!hasPositionGeometry) return false;
    const binOffset = 20 + jsonLength;
    const binLength = view.getUint32(binOffset, true);
    if (view.getUint32(binOffset + 4, true) !== 0x004e4942 ||
        !binLength || binLength % 4 !== 0 ||
        binOffset + 8 + binLength !== bytes.byteLength) return false;
    const bufferBytes = gltf.buffers[0]?.byteLength;
    return Number.isInteger(bufferBytes) && bufferBytes > 0 && bufferBytes <= binLength;
  } catch {
    return false;
  }
}
