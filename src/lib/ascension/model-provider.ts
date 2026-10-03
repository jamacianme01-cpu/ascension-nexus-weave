/**
 * Pathway model provider — the seam between ENVISION and ASCENSION's
 * designated 3D generation engine (Hunyuan3D).
 *
 * HONEST STATUS: no Hunyuan3D runtime or API connection is wired into this
 * repository today. Nothing here may pretend otherwise. The adapter is
 * configuration-driven: when an endpoint is provided (VITE_HUNYUAN3D_ENDPOINT
 * build-time, or the "ascension.hunyuan3d.endpoint" local setting), ENVISION
 * will request a generated GLB for the focused pathway and render it. When it
 * is absent, unreachable, slow, or returns anything unusable, the provider
 * resolves to null and the procedural pathway geometry remains the visual
 * authority. ENVISION never waits on this — the manifestation sequence always
 * proceeds on the procedural fallback.
 */

export type PathwayModel = {
  kind: "gltf";
  url: string;
};

export type PathwayModelRequest = {
  id: string;
  label: string;
  summary: string;
  spiralForm: string | null;
};

export interface PathwayModelProvider {
  readonly id: string;
  isConfigured(): boolean;
  /** Resolves null whenever no usable generated model is available. Never throws. */
  fetchModel(request: PathwayModelRequest, signal?: AbortSignal): Promise<PathwayModel | null>;
}

const ENDPOINT_SETTING = "ascension.hunyuan3d.endpoint";
const FETCH_TIMEOUT_MS = 12_000;

function endpointFromEnv(): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env["VITE_HUNYUAN3D_ENDPOINT"];
  return typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

function endpointFromSetting(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(ENDPOINT_SETTING);
    return value && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
  } catch {
    return null;
  }
}

export function hunyuan3DEndpoint(): string | null {
  return endpointFromSetting() ?? endpointFromEnv();
}

/** Truthful wiring status, safe to surface in the interface. */
export function hunyuan3DStatus(): { wired: boolean; detail: string } {
  return hunyuan3DEndpoint()
    ? {
        wired: true,
        detail:
          "A Hunyuan3D endpoint is configured. ENVISION will use generated GLB models when the endpoint answers in time.",
      }
    : {
        wired: false,
        detail:
          "Hunyuan3D is not connected. Procedural pathway geometry is the active ENVISION renderer; no generated model is implied.",
      };
}

export const hunyuan3DProvider: PathwayModelProvider = {
  id: "hunyuan3d",
  isConfigured: () => hunyuan3DEndpoint() !== null,
  async fetchModel(request, signal) {
    const endpoint = hunyuan3DEndpoint();
    if (!endpoint) return null;
    const timeout = new AbortController();
    const timer =
      typeof setTimeout === "function" ? setTimeout(() => timeout.abort(), FETCH_TIMEOUT_MS) : null;
    const onOuterAbort = () => timeout.abort();
    signal?.addEventListener("abort", onOuterAbort, { once: true });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: timeout.signal,
        body: JSON.stringify({
          engine: "hunyuan3d",
          pathway_id: request.id,
          prompt: [request.label, request.spiralForm, request.summary].filter(Boolean).join(". "),
        }),
      });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      const record =
        payload !== null && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const url = record["model_url"];
      if (
        typeof url !== "string" ||
        !/^https?:\/\//i.test(url) ||
        !/\.(glb|gltf)(\?|$)/i.test(url)
      ) {
        return null;
      }
      return { kind: "gltf", url };
    } catch {
      return null;
    } finally {
      if (timer !== null) clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
  },
};

/** Try every configured provider; null means "render the procedural fallback". */
export async function resolvePathwayModel(
  request: PathwayModelRequest,
  signal?: AbortSignal,
): Promise<PathwayModel | null> {
  if (!hunyuan3DProvider.isConfigured()) return null;
  return hunyuan3DProvider.fetchModel(request, signal);
}

/* ------------------------------------------------------------------ */
/* Minimal GLB mesh reader                                             */
/* ------------------------------------------------------------------ */

type Vec3 = [number, number, number];

type RawAccessor = {
  floats: Float32Array;
  count: number;
  components: number;
};

type Mat4 = Float32Array;

/** Float32Array reads are `number | undefined` under noUncheckedIndexedAccess. */
const at = (m: ArrayLike<number>, i: number): number => m[i] ?? 0;

function mat4Identity(): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        at(a, r) * at(b, c * 4) +
        at(a, 4 + r) * at(b, c * 4 + 1) +
        at(a, 8 + r) * at(b, c * 4 + 2) +
        at(a, 12 + r) * at(b, c * 4 + 3);
    }
  }
  return out;
}

function mat4FromNode(node: Record<string, unknown>): Mat4 {
  const matrix = node["matrix"];
  if (Array.isArray(matrix) && matrix.length === 16 && matrix.every((v) => typeof v === "number")) {
    // glTF matrices are column-major, same as our layout.
    return new Float32Array(matrix as number[]);
  }
  const t = Array.isArray(node["translation"]) ? (node["translation"] as number[]) : [0, 0, 0];
  const s = Array.isArray(node["scale"]) ? (node["scale"] as number[]) : [1, 1, 1];
  const q = Array.isArray(node["rotation"]) ? (node["rotation"] as number[]) : [0, 0, 0, 1];
  const [x, y, z, w] = [at(q, 0), at(q, 1), at(q, 2), q[3] ?? 1];
  const [sx, sy, sz] = [s[0] ?? 1, s[1] ?? 1, s[2] ?? 1];
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;
  const m = mat4Identity();
  m[0] = (1 - (yy + zz)) * sx;
  m[1] = (xy + wz) * sx;
  m[2] = (xz - wy) * sx;
  m[4] = (xy - wz) * sy;
  m[5] = (1 - (xx + zz)) * sy;
  m[6] = (yz + wx) * sy;
  m[8] = (xz + wy) * sz;
  m[9] = (yz - wx) * sz;
  m[10] = (1 - (xx + yy)) * sz;
  m[12] = at(t, 0);
  m[13] = at(t, 1);
  m[14] = at(t, 2);
  return m;
}

const COMPONENT_TYPES: Record<
  number,
  new (buffer: ArrayBufferLike) => Float32Array | Uint16Array | Uint32Array
> = {
  5126: Float32Array,
  5123: Uint16Array,
  5125: Uint32Array,
};

const COMPONENT_SIZE: Record<number, number> = { 5126: 4, 5123: 2, 5125: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC3: 3 };

function readAccessor(
  gltf: Record<string, unknown>,
  bin: Uint8Array | null,
  index: unknown,
): RawAccessor | null {
  if (typeof index !== "number") return null;
  const accessors = gltf["accessors"];
  const bufferViews = gltf["bufferViews"];
  const buffers = gltf["buffers"];
  if (!Array.isArray(accessors) || !Array.isArray(bufferViews) || !Array.isArray(buffers))
    return null;
  const accessor = accessors[index];
  if (accessor === null || typeof accessor !== "object") return null;
  const a = accessor as Record<string, unknown>;
  const componentType = a["componentType"];
  const type = a["type"];
  const count = a["count"];
  if (
    typeof componentType !== "number" ||
    typeof type !== "string" ||
    typeof count !== "number" ||
    !(componentType in COMPONENT_TYPES) ||
    !(type in TYPE_COMPONENTS) ||
    a["normalized"] === true
  ) {
    return null;
  }
  const viewIndex = a["bufferView"];
  if (typeof viewIndex !== "number") return null;
  const view = bufferViews[viewIndex];
  if (view === null || typeof view !== "object") return null;
  const v = view as Record<string, unknown>;
  const components = TYPE_COMPONENTS[type] ?? 0;
  const componentSize = COMPONENT_SIZE[componentType] ?? 0;
  const bytesNeeded = count * components * componentSize;
  if (bytesNeeded <= 0) return null;
  const byteOffset = typeof v["byteOffset"] === "number" ? v["byteOffset"] : 0;
  const byteStride =
    typeof v["byteStride"] === "number" ? v["byteStride"] : components * componentSize;
  if (byteStride !== components * componentSize) return null; // interleaved layouts are not supported
  const source = resolveBufferBytes(gltf, buffers, bin, v["buffer"], byteOffset + bytesNeeded);
  if (!source) return null;
  const Ctor = COMPONENT_TYPES[componentType];
  if (!Ctor) return null;
  // Copy into a fresh, aligned buffer so the typed view starts at element 0.
  const bytes = source.slice(byteOffset, byteOffset + bytesNeeded);
  const aligned = new Ctor(bytes.buffer);
  return { floats: aligned as Float32Array, count, components };
}

function resolveBufferBytes(
  gltf: Record<string, unknown>,
  buffers: unknown[],
  bin: Uint8Array | null,
  bufferIndex: unknown,
  bytesNeeded: number,
): Uint8Array | null {
  if (typeof bufferIndex !== "number") return null;
  const buffer = buffers[bufferIndex];
  if (buffer === null || typeof buffer !== "object") return null;
  const b = buffer as Record<string, unknown>;
  if (typeof b["uri"] === "string") return null; // external/embedded buffers are out of scope
  if (!bin) return null;
  if (bytesNeeded > bin.byteLength) return null;
  return bin;
}

function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    at(m, 0) * p[0] + at(m, 4) * p[1] + at(m, 8) * p[2] + at(m, 12),
    at(m, 1) * p[0] + at(m, 5) * p[1] + at(m, 9) * p[2] + at(m, 13),
    at(m, 2) * p[0] + at(m, 6) * p[1] + at(m, 10) * p[2] + at(m, 14),
  ];
}

function normalFromMatrix(m: Mat4, n: Vec3): Vec3 {
  const x = at(m, 0) * n[0] + at(m, 4) * n[1] + at(m, 8) * n[2];
  const y = at(m, 1) * n[0] + at(m, 5) * n[1] + at(m, 9) * n[2];
  const z = at(m, 2) * n[0] + at(m, 6) * n[1] + at(m, 10) * n[2];
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/** Upper bound on accepted vertices — a concept visualization, not a CAD import. */
const MAX_VERTICES = 600_000;

/**
 * Parse a binary glTF (.glb) into ENVISION's interleaved triangle format:
 * [px,py,pz,nx,ny,nz] per vertex, non-indexed. Only POSITION/NORMAL accessors
 * of triangulated meshes are read; anything else (quantized, interleaved,
 * external buffers, extreme sizes) fails closed to null so the caller keeps
 * the procedural pathway geometry.
 */
export function parseGlbVertices(buffer: ArrayBuffer): Float32Array | null {
  try {
    const view = new DataView(buffer);
    if (
      view.byteLength < 20 ||
      view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2
    ) {
      return null;
    }
    const total = Math.min(view.getUint32(8, true), view.byteLength);
    let offset = 12;
    let gltf: Record<string, unknown> | null = null;
    let bin: Uint8Array | null = null;
    while (offset + 8 <= total) {
      const length = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      if (length > total - offset - 8) return null;
      const bytes = new Uint8Array(buffer, offset + 8, length);
      if (chunkType === 0x4e4f534a) {
        // The spec pads JSON chunks with spaces; tolerate NUL padding too.
        const text = new TextDecoder().decode(bytes).replace(/[\0\s]+$/, "");
        const parsed: unknown = JSON.parse(text);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        gltf = parsed as Record<string, unknown>;
      } else if (chunkType === 0x004e4942) {
        bin = bytes;
      }
      offset += 8 + length + (length % 4);
    }
    if (!gltf || !Array.isArray(gltf["meshes"]) || !Array.isArray(gltf["nodes"])) return null;
    const doc: Record<string, unknown> = gltf;
    const nodes = gltf["nodes"] as unknown[];
    const meshes = gltf["meshes"] as unknown[];
    const out: number[] = [];
    const emitNode = (nodeIndex: number, parent: Mat4, depth: number): void => {
      if (depth > 16 || out.length >= MAX_VERTICES * 6) return;
      const raw = nodes[nodeIndex];
      if (raw === null || typeof raw !== "object") return;
      const node = raw as Record<string, unknown>;
      const world = mat4Multiply(parent, mat4FromNode(node));
      if (typeof node["mesh"] === "number") {
        const mesh = meshes[node["mesh"]];
        if (mesh !== null && typeof mesh === "object") {
          emitMesh(mesh as Record<string, unknown>, world, out);
        }
      }
      if (Array.isArray(node["children"])) {
        for (const child of node["children"]) {
          if (typeof child === "number") emitNode(child, world, depth + 1);
        }
      }
    };

    const emitMesh = (mesh: Record<string, unknown>, world: Mat4, out: number[]): void => {
      const primitives = mesh["primitives"];
      if (!Array.isArray(primitives)) return;
      for (const rawPrimitive of primitives) {
        if (rawPrimitive === null || typeof rawPrimitive !== "object") continue;
        const primitive = rawPrimitive as Record<string, unknown>;
        if (primitive["mode"] !== undefined && primitive["mode"] !== 4) continue; // triangles only
        const attributes = primitive["attributes"];
        if (attributes === null || typeof attributes !== "object") continue;
        const attrs = attributes as Record<string, unknown>;
        const positionAccessor = readAccessor(doc, bin, attrs["POSITION"]);
        if (!positionAccessor || positionAccessor.components !== 3) continue;
        const normalAccessor = readAccessor(doc, bin, attrs["NORMAL"]);
        const indexAccessor = readAccessor(doc, bin, primitive["indices"]);
        const triangleCount =
          indexAccessor && indexAccessor.components === 1
            ? Math.floor(indexAccessor.count / 3)
            : Math.floor(positionAccessor.count / 3);
        const positionAt = (i: number): Vec3 => {
          const o = i * 3;
          return [
            positionAccessor.floats[o] ?? 0,
            positionAccessor.floats[o + 1] ?? 0,
            positionAccessor.floats[o + 2] ?? 0,
          ];
        };
        const normalAt = (i: number): Vec3 | null => {
          if (!normalAccessor || normalAccessor.components !== 3) return null;
          const o = i * 3;
          return [
            normalAccessor.floats[o] ?? 0,
            normalAccessor.floats[o + 1] ?? 0,
            normalAccessor.floats[o + 2] ?? 0,
          ];
        };
        for (let t = 0; t < triangleCount; t++) {
          const corners = [0, 1, 2].map((c) =>
            indexAccessor && indexAccessor.components === 1
              ? (indexAccessor.floats[t * 3 + c] ?? 0)
              : t * 3 + c,
          ) as [number, number, number];
          const pa = positionAt(corners[0]);
          const pb = positionAt(corners[1]);
          const pc = positionAt(corners[2]);
          const fallbackNormal = (() => {
            const u: Vec3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
            const v: Vec3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
            const n: Vec3 = [
              u[1] * v[2] - u[2] * v[1],
              u[2] * v[0] - u[0] * v[2],
              u[0] * v[1] - u[1] * v[0],
            ];
            const len = Math.hypot(n[0], n[1], n[2]) || 1;
            return [n[0] / len, n[1] / len, n[2] / len] as Vec3;
          })();
          for (const [cornerIndex, position] of [
            [corners[0], pa],
            [corners[1], pb],
            [corners[2], pc],
          ] as [number, Vec3][]) {
            if (out.length >= MAX_VERTICES * 6) return;
            const world0 = transformPoint(world, position);
            const normal = normalAt(cornerIndex) ?? fallbackNormal;
            const worldN = normalFromMatrix(world, normal);
            out.push(world0[0], world0[1], world0[2], worldN[0], worldN[1], worldN[2]);
          }
        }
      }
    };

    const scenes = Array.isArray(gltf["scenes"]) ? gltf["scenes"] : [];
    const defaultScene =
      typeof gltf["scene"] === "number" ? (gltf["scene"] as number) : scenes.length > 0 ? 0 : -1;
    const scene = scenes[defaultScene];
    const identity = mat4Identity();
    if (
      scene !== null &&
      typeof scene === "object" &&
      Array.isArray((scene as Record<string, unknown>)["nodes"])
    ) {
      for (const node of (scene as Record<string, unknown>)["nodes"] as unknown[]) {
        if (typeof node === "number") emitNode(node, identity, 0);
      }
    } else if (Array.isArray(gltf["nodes"])) {
      for (let i = 0; i < gltf["nodes"].length; i++) emitNode(i, identity, 0);
    }

    if (out.length < 9 || out.length % 6 !== 0) return null;
    return new Float32Array(out);
  } catch {
    return null;
  }
}
