/** A named-part GLB so views, explode, and descriptions have separate meshes.
 * This is the design's own part list, not a scanned Hunyuan surface.
 */
export function buildInterpretiveAssemblyGlb(names: string[]): ArrayBuffer {
  const labels = names.map(name => name.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12);
  while (labels.length < 2) labels.push(labels.length === 0 ? "Body" : "Assembly");
  const box = boxPositions();
  const stride = box.byteLength;
  const bin = new Uint8Array(stride * labels.length);
  for (let index = 0; index < labels.length; index++) bin.set(new Uint8Array(box.buffer, box.byteOffset, stride), index * stride);
  const bufferViews = labels.map((_, index) => ({ buffer: 0, byteOffset: index * stride, byteLength: stride, target: 34962 }));
  const accessors = labels.map((_, index) => ({
    bufferView: index, componentType: 5126, count: 36, type: "VEC3",
    min: [-1, -1, -1], max: [1, 1, 1],
  }));
  const meshes = labels.map((name, index) => ({
    name, primitives: [{ attributes: { POSITION: index }, mode: 4 }],
  }));
  const nodes = labels.map((name, index) => {
    const angle = (index / labels.length) * Math.PI * 2;
    return {
      name, mesh: index,
      translation: [Math.cos(angle) * 0.2, (index - (labels.length - 1) / 2) * 0.05, Math.sin(angle) * 0.2],
      scale: [0.32, 0.32, 0.32],
    };
  });
  const json = JSON.stringify({
    asset: { version: "2.0", generator: "ascension-named-parts" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes, meshes, accessors, bufferViews,
    buffers: [{ byteLength: bin.byteLength }],
  });
  const jsonBytes = new TextEncoder().encode(json);
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let cursor = 12;
  view.setUint32(cursor, jsonBytes.length + jsonPad, true);
  view.setUint32(cursor + 4, 0x4e4f534a, true);
  bytes.set(jsonBytes, cursor + 8);
  bytes.fill(0x20, cursor + 8 + jsonBytes.length, cursor + 8 + jsonBytes.length + jsonPad);
  cursor += 8 + jsonBytes.length + jsonPad;
  view.setUint32(cursor, bin.length + binPad, true);
  view.setUint32(cursor + 4, 0x004e4942, true);
  bytes.set(bin, cursor + 8);
  return out;
}

export function glbMeshCount(buffer: ArrayBuffer): number {
  if (buffer.byteLength < 20) return 0;
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) return 0;
  const length = view.getUint32(12, true);
  if (20 + length > buffer.byteLength) return 0;
  try {
    const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))) as { meshes?: unknown[] };
    return Array.isArray(doc.meshes) ? doc.meshes.length : 0;
  } catch {
    return 0;
  }
}

function boxPositions(): Float32Array {
  const faces: Array<[[number, number, number], [number, number, number], [number, number, number], [number, number, number]]> = [
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
    [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
    [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
  ];
  const data: number[] = [];
  for (const [a, b, c, d] of faces) {
    data.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return new Float32Array(data);
}
