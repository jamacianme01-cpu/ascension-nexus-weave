import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { canonicalAssembly, pathwayKind } from "@/lib/ascension/canonical-assembly";
import { Button } from "@/components/ui/button";
import type { ObjectiveDelivery } from "@/lib/ascension/result-model";
import {
  MANIFESTATION_PHASE_LABEL,
  PHASE_BOUNDARY,
  assemblySpin,
  easeOutCubic,
  lerp,
  linearSpecFromText,
  manifestationPhase,
  partHash,
  partLockMs,
  partScatterDir,
  phaseProgress,
  type LinearSpec,
  type ManifestationPhase,
} from "@/lib/ascension/manifestation";
import { parseGlbVertices, type PathwayModel } from "@/lib/ascension/model-provider";

type Pathway = ObjectiveDelivery["pathways"][number];
/** Presentation modes for a focused reality: exhibition cutaway, drafting plate, in-world hall. */
type VisualMode = "cutaway" | "blueprint" | "environment";
type Props = {
  delivery: ObjectiveDelivery;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUse: (pathway: Pathway, mode?: VisualMode) => void;
  /** The user's objective text. Only used to detect THEIR declared specs (e.g. 48 V · 9 coils). */
  objectiveText?: string | undefined;
  /** Fired when the primary manifestation clock crosses a phase boundary. */
  onPhaseChange?: ((phase: ManifestationPhase, info: { blend: boolean }) => void) | undefined;
};

type Vec3 = [number, number, number];
type Mesh = { buffer: WebGLBuffer; count: number };

const PATH_SLOTS = [
  { left: "22%", top: "24%", labelTop: "38%", pos: [-2.55, 1.3, 0.1] as Vec3 },
  { left: "78%", top: "24%", labelTop: "38%", pos: [2.55, 1.3, 0.1] as Vec3 },
  {
    left: "24%",
    top: "62%",
    labelTop: "76%",
    pos: [-2.35, -1.18, 0.14] as Vec3,
  },
  {
    left: "76%",
    top: "62%",
    labelTop: "76%",
    pos: [2.35, -1.18, 0.14] as Vec3,
  },
];
const FOCUS_BASE: Vec3 = [0, 0.38, 0];
const BLEND_POS: Vec3 = [0, -0.12, 0.78];
const STATION_STAGGER_MS = 160;

function matIdentity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
function matMul(a: Float32Array, b: Float32Array) {
  const o = new Float32Array(16);
  const at = (m: Float32Array, i: number) => m[i] ?? 0;
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] =
        at(a, r) * at(b, c * 4) +
        at(a, 4 + r) * at(b, c * 4 + 1) +
        at(a, 8 + r) * at(b, c * 4 + 2) +
        at(a, 12 + r) * at(b, c * 4 + 3);
  return o;
}
function translate(x: number, y: number, z: number) {
  const m = matIdentity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}
function scaleM(x: number, y: number, z: number) {
  const m = matIdentity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}
function rotX(a: number) {
  const c = Math.cos(a),
    s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
function rotY(a: number) {
  const c = Math.cos(a),
    s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
function rotZ(a: number) {
  const c = Math.cos(a),
    s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
}
function compose(p: Vec3, r: Vec3 = [0, 0, 0], s: Vec3 = [1, 1, 1]) {
  let m = translate(...p);
  m = matMul(m, rotZ(r[2] ?? 0));
  m = matMul(m, rotY(r[1] ?? 0));
  m = matMul(m, rotX(r[0] ?? 0));
  return matMul(m, scaleM(...s));
}
function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2),
    nf = 1 / (near - far),
    o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) * nf;
  o[11] = -1;
  o[14] = 2 * far * near * nf;
  return o;
}
function norm(v: Vec3): Vec3 {
  const d = Math.hypot(...v) || 1;
  return [v[0] / d, v[1] / d, v[2] / d];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function lookAt(eye: Vec3, center: Vec3, up: Vec3) {
  const z = norm([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]),
    x = norm(cross(up, z)),
    y = cross(z, x);
  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ]);
}

/* ------------------------------ primitives ------------------------------ */

function cubeVertices() {
  const f: Array<[Vec3, Vec3, Vec3, Vec3, Vec3]> = [
      [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
        [0, 0, 1],
      ],
      [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
        [0, 0, -1],
      ],
      [
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1],
        [0, 1, 0],
      ],
      [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
        [0, -1, 0],
      ],
      [
        [1, -1, 1],
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, 0, 0],
      ],
      [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, 0, 0],
      ],
    ],
    d: number[] = [];
  const q = (p: Vec3, n: Vec3) => d.push(...p, ...n);
  f.forEach(([a, b, c, e, n]) => {
    q(a, n);
    q(b, n);
    q(c, n);
    q(a, n);
    q(c, n);
    q(e, n);
  });
  return new Float32Array(d);
}
function torusVertices(seg = 30, tube = 10) {
  const d: number[] = [];
  const v = (u: number, w: number) => {
    const cu = Math.cos(u),
      su = Math.sin(u),
      cw = Math.cos(w),
      sw = Math.sin(w),
      R = 1,
      r = 0.18;
    return {
      p: [(R + r * cw) * cu, (R + r * cw) * su, r * sw] as Vec3,
      n: [cw * cu, cw * su, sw] as Vec3,
    };
  };
  const q = (x: { p: Vec3; n: Vec3 }) => d.push(...x.p, ...x.n);
  for (let i = 0; i < seg; i++) {
    const u0 = (i / seg) * Math.PI * 2,
      u1 = ((i + 1) / seg) * Math.PI * 2;
    for (let j = 0; j < tube; j++) {
      const w0 = (j / tube) * Math.PI * 2,
        w1 = ((j + 1) / tube) * Math.PI * 2,
        a = v(u0, w0),
        b = v(u1, w0),
        c = v(u1, w1),
        e = v(u0, w1);
      q(a);
      q(b);
      q(c);
      q(a);
      q(c);
      q(e);
    }
  }
  return new Float32Array(d);
}
function sphereVertices(lat = 16, lon = 22) {
  const d: number[] = [];
  const v = (a: number, b: number) => {
    const s = Math.sin(a),
      p: [number, number, number] = [s * Math.cos(b), Math.cos(a), s * Math.sin(b)];
    return { p: p as Vec3, n: p as Vec3 };
  };
  const q = (x: { p: Vec3; n: Vec3 }) => d.push(...x.p, ...x.n);
  for (let i = 0; i < lat; i++) {
    const a0 = (i / lat) * Math.PI,
      a1 = ((i + 1) / lat) * Math.PI;
    for (let j = 0; j < lon; j++) {
      const b0 = (j / lon) * Math.PI * 2,
        b1 = ((j + 1) / lon) * Math.PI * 2,
        A = v(a0, b0),
        B = v(a1, b0),
        C = v(a1, b1),
        E = v(a0, b1);
      q(A);
      q(B);
      q(C);
      q(A);
      q(C);
      q(E);
    }
  }
  return new Float32Array(d);
}
function cylinderVertices(segments = 28, tapered = false) {
  const d: number[] = [];
  const q = (p: Vec3, n: Vec3) => d.push(...p, ...n);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2,
      b = ((i + 1) / segments) * Math.PI * 2;
    const ca = Math.cos(a),
      sa = Math.sin(a),
      cb = Math.cos(b),
      sb = Math.sin(b);
    const r0 = tapered ? 0.42 : 1,
      r1 = 1;
    const p1: [Vec3, Vec3] = [
      [-1, ca * r0, sa * r0],
      [-1, 0, 0],
    ];
    const p2: [Vec3, Vec3] = [
      [1, ca * r1, sa * r1],
      [1, 0, 0],
    ];
    const p3: [Vec3, Vec3] = [
      [1, cb * r1, sb * r1],
      [1, 0, 0],
    ];
    const p4: [Vec3, Vec3] = [
      [-1, cb * r0, sb * r0],
      [-1, 0, 0],
    ];
    const nx = (r0 - r1) * 0.5;
    const na = norm([nx, ca, sa]),
      nb = norm([nx, cb, sb]);
    q(p1[0], na);
    q(p2[0], na);
    q(p3[0], nb);
    q(p1[0], na);
    q(p3[0], nb);
    q(p4[0], nb);
    q([-1, 0, 0], [-1, 0, 0]);
    q(p4[0], [-1, 0, 0]);
    q(p1[0], [-1, 0, 0]);
    q([1, 0, 0], [1, 0, 0]);
    q(p2[0], [1, 0, 0]);
    q(p3[0], [1, 0, 0]);
  }
  return new Float32Array(d);
}
/** Thin ornamental orbit band (large radius, slender tube) for gilded halo rings. */
function orbitVertices(seg = 64, tube = 8) {
  const d: number[] = [];
  const v = (u: number, w: number): { p: Vec3; n: Vec3 } => {
    const cu = Math.cos(u),
      su = Math.sin(u),
      cw = Math.cos(w),
      sw = Math.sin(w),
      R = 1,
      r = 0.035;
    return {
      p: [(R + r * cw) * cu, (R + r * cw) * su, r * sw],
      n: [cw * cu, cw * su, sw],
    };
  };
  const q = (x: { p: Vec3; n: Vec3 }) => d.push(...x.p, ...x.n);
  for (let i = 0; i < seg; i++) {
    const u0 = (i / seg) * Math.PI * 2,
      u1 = ((i + 1) / seg) * Math.PI * 2;
    for (let j = 0; j < tube; j++) {
      const w0 = (j / tube) * Math.PI * 2,
        w1 = ((j + 1) / tube) * Math.PI * 2,
        a = v(u0, w0),
        b = v(u1, w0),
        c = v(u1, w1),
        e = v(u0, w1);
      q(a);
      q(b);
      q(c);
      q(a);
      q(c);
      q(e);
    }
  }
  return new Float32Array(d);
}

/**
 * Technical-drawing wireframes for BLUEPRINT mode. Walks the same triangle
 * soup the cutaway renders and keeps only drafting linework: boundary edges
 * plus creases sharper than ~30°. Output is line-vertex pairs (pos + t=0) so
 * the drawing stays steady instead of flowing like energy filaments.
 */
function wireEdges(src: Float32Array): {
  feature: Float32Array;
  all: Float32Array;
} {
  const key = (v: number) => Math.round(v * 2000) / 2000;
  type EdgeAcc = { a: Vec3; b: Vec3; n: Vec3; count: number; creased: boolean };
  const seen = new Map<string, EdgeAcc>();
  const all: number[] = [];
  const verts: Vec3[] = [];
  for (let i = 0; i < src.length; i += 18) {
    verts.length = 0;
    for (let v = 0; v < 3; v++)
      verts.push([src[i + v * 3] ?? 0, src[i + v * 3 + 1] ?? 0, src[i + v * 3 + 2] ?? 0]);
    const [a, b, c] = verts as [Vec3, Vec3, Vec3];
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2],
      vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const pairs: [Vec3, Vec3][] = [
      [a, b],
      [b, c],
      [c, a],
    ];
    for (const [m, n] of pairs) {
      all.push(m[0], m[1], m[2], 0, n[0], n[1], n[2], 0);
      const k1 = `${key(m[0])},${key(m[1])},${key(m[2])}`,
        k2 = `${key(n[0])},${key(n[1])},${key(n[2])}`;
      const ek = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      const acc = seen.get(ek);
      if (!acc) seen.set(ek, { a: m, b: n, n: [nx, ny, nz], count: 1, creased: false });
      else {
        acc.count++;
        if (acc.n[0] * nx + acc.n[1] * ny + acc.n[2] * nz < 0.86) acc.creased = true;
      }
    }
  }
  const feature: number[] = [];
  for (const e of seen.values()) {
    if (e.count === 1 || e.creased)
      feature.push(e.a[0], e.a[1], e.a[2], 0, e.b[0], e.b[1], e.b[2], 0);
  }
  return { feature: new Float32Array(feature), all: new Float32Array(all) };
}

/** Luminous filaments: two woven helices winding the assembly axis (unit space, X axis). */
function helixVertices(segments = 54) {
  const d: number[] = [];
  for (let strip = 0; strip < 2; strip++) {
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const ang = t * Math.PI * 4 + strip * Math.PI;
      const r = 0.52 + 0.14 * Math.sin(t * 9.4 + strip * 1.7);
      d.push((t - 0.5) * 2.4, Math.cos(ang) * r, Math.sin(ang) * r, t);
    }
  }
  return new Float32Array(d);
}
/** Field arcs rising from the projector plane to the assembly (unit space). */
function arcVertices() {
  const d: number[] = [];
  const curves: [Vec3, Vec3][] = [
    [
      [-0.38, -0.45, 0.22],
      [0.18, -0.3, -0.26],
    ],
    [
      [0.42, -0.5, -0.12],
      [-0.2, -0.28, 0.3],
    ],
    [
      [0, -0.55, 0.05],
      [0, -0.34, 0],
    ],
  ];
  for (const [ctrl, end] of curves) {
    const segs = 18,
      start: Vec3 = [0, -0.95, 0];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs,
        mt = 1 - t;
      d.push(
        mt * mt * start[0] + 2 * mt * t * ctrl[0] + t * t * end[0],
        mt * mt * start[1] + 2 * mt * t * ctrl[1] + t * t * end[1],
        mt * mt * start[2] + 2 * mt * t * ctrl[2] + t * t * end[2],
        t,
      );
    }
  }
  return new Float32Array(d);
}

/* ------------------------------ pathway kind ------------------------------ */

/* ------------------------------ shaders ------------------------------ */

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) throw new Error("shader");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}
function buildProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
  const v = shader(gl, gl.VERTEX_SHADER, vs),
    f = shader(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  if (!p) throw new Error("program");
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) || "link");
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}
function solidProgram(gl: WebGLRenderingContext) {
  return buildProgram(
    gl,
    `attribute vec3 aP;attribute vec3 aN;uniform mat4 uM;uniform mat4 uVP;varying vec3 vN;varying vec3 vW;void main(){vec4 w=uM*vec4(aP,1.0);vW=w.xyz;vN=normalize(mat3(uM)*aN);gl_Position=uVP*w;}`,
    // Gilded-glass look matched to the approved Tree artwork: luminous bodies,
    // warm gold rim light, cool core, no matte black silhouettes.
    `precision mediump float;uniform vec3 uC;uniform vec3 uEye;uniform float uGlow;uniform float uAlpha;varying vec3 vN;varying vec3 vW;void main(){vec3 n=normalize(vN),l=normalize(vec3(-.45,.72,.68)),v=normalize(uEye-vW);float d=max(dot(n,l),0.0),rim=pow(1.0-max(dot(n,v),0.0),2.4),heart=pow(max(dot(n,v),0.0),2.2);float scan=.99+.01*sin((vW.y+vW.x*.14)*18.0);vec3 gold=vec3(1.0,.82,.44);vec3 c=uC*(.30+d*.40)+mix(uC,gold,.38)*rim*(.55+uGlow*.5)+vec3(1.0,.9,.66)*heart*(.04+uGlow*.1);c+=vec3(.03,.10,.15)*uGlow*.16;gl_FragColor=vec4(min(c,vec3(.97)),uAlpha);}`,
  );
}
function lineProgram(gl: WebGLRenderingContext) {
  return buildProgram(
    gl,
    `attribute vec3 aP;attribute float aT;uniform mat4 uM;uniform mat4 uVP;varying float vT;void main(){gl_Position=uVP*uM*vec4(aP,1.0);vT=aT;}`,
    `precision mediump float;uniform vec3 uC;uniform float uAlpha;uniform float uTime;uniform float uEnergy;varying float vT;void main(){float flow=.55+.45*sin(vT*18.85-uTime*3.4);float a=uAlpha*(.4+.6*flow)*uEnergy;vec3 c=uC*(0.75+.5*flow);gl_FragColor=vec4(min(c,vec3(1.0)),clamp(a,0.0,1.0));}`,
  );
}
function pointProgram(gl: WebGLRenderingContext) {
  return buildProgram(
    gl,
    `attribute vec3 aP;attribute float aS;attribute float aB;uniform mat4 uVP;uniform float uScale;varying float vB;void main(){gl_Position=uVP*vec4(aP,1.0);gl_PointSize=aS*uScale;vB=aB;}`,
    `precision mediump float;uniform vec3 uC;uniform float uAlpha;varying float vB;void main(){vec2 d=gl_PointCoord-vec2(.5);float r=length(d);if(r>.5)discard;float soft=smoothstep(.5,.08,r);gl_FragColor=vec4(uC,clamp(uAlpha*vB*soft,0.0,1.0));}`,
  );
}

function mesh(gl: WebGLRenderingContext, data: Float32Array): Mesh {
  const b = gl.createBuffer();
  if (!b) throw new Error("buffer");
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { buffer: b, count: data.length / 6 };
}
function lineMesh(gl: WebGLRenderingContext, data: Float32Array): Mesh {
  const b = gl.createBuffer();
  if (!b) throw new Error("buffer");
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { buffer: b, count: data.length / 4 };
}
function dynamicBuffer(gl: WebGLRenderingContext): WebGLBuffer {
  const b = gl.createBuffer();
  if (!b) throw new Error("buffer");
  return b;
}
function hue(i: number): Vec3 {
  return i === 0
    ? [0.12, 0.78, 1]
    : i === 1
      ? [0.45, 0.42, 1]
      : i === 2
        ? [0.08, 1, 0.68]
        : [1, 0.38, 0.22];
}

/** Gilded palette taken from the approved Tree artwork: gold filigree structure,
 *  deep blue glass bodies, cyan energy, one warm light heart. */
const GOLD: Vec3 = [1, 0.8, 0.38];
const GOLD_DEEP: Vec3 = [0.86, 0.6, 0.24];
const BLUE_GLASS: Vec3 = [0.34, 0.58, 0.98];
const BLUE_GLASS_DEEP: Vec3 = [0.18, 0.36, 0.72];
const ICE: Vec3 = [0.62, 0.88, 1];
const CYAN: Vec3 = [0.28, 0.84, 0.95];
const WARM_LIGHT: Vec3 = [1, 0.92, 0.7];

/* deterministic particle field */
type Particle = {
  dir: Vec3;
  speed: number;
  size: number;
  gold: boolean;
  phase: number;
  wobble: number;
};
const PARTICLES_PER_STATION = 64;
function seedParticles(): Particle[] {
  const list: Particle[] = [];
  let seed = 20260901;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < PARTICLES_PER_STATION; i++) {
    const a = rand() * Math.PI * 2,
      b = (rand() - 0.5) * Math.PI;
    list.push({
      dir: [Math.cos(a) * Math.cos(b), Math.sin(b) * 0.72, Math.sin(a) * Math.cos(b)],
      speed: 0.55 + rand() * 1.25,
      size: 5 + rand() * 9,
      gold: rand() > 0.74,
      phase: rand() * Math.PI * 2,
      wobble: 0.5 + rand(),
    });
  }
  return list;
}

export function Envision3DScene({
  delivery,
  selectedId,
  onSelect,
  onUse,
  objectiveText,
  onPhaseChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const rotationRef = useRef({ x: -0.22, y: 0.55 });
  const zoomRef = useRef(1);
  const dragRef = useRef<{
    x: number;
    y: number;
    active: boolean;
    moved: boolean;
  }>({
    x: 0,
    y: 0,
    active: false,
    moved: false,
  });
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistRef = useRef<number | null>(null);
  const overviewStartRef = useRef(0);
  const focusStartRef = useRef(0);
  const lastPhaseRef = useRef<ManifestationPhase>("idle");
  const onPhaseChangeRef = useRef(onPhaseChange);
  const stationFadeRef = useRef([1, 1, 1, 1, 1]);
  const [dragging, setDragging] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [phase, setPhase] = useState<ManifestationPhase>("possibility");
  // The render loop runs inside a RAF closure, so it reads the ref; the
  // state copy only drives the HUD.
  const generatedRef = useRef<{
    id: string;
    mesh: Float32Array;
    url: string;
  } | null>(null);
  const [generated, setGenerated] = useState<{
    id: string;
    mesh: Float32Array;
    url: string;
  } | null>(null);
  const publishGenerated = (value: { id: string; mesh: Float32Array; url: string } | null) => {
    generatedRef.current = value;
    setGenerated(value);
  };
  onPhaseChangeRef.current = onPhaseChange;
  // Presentation mode of the focused reality. The RAF closure reads the ref so
  // switching modes never rebuilds the WebGL pipeline.
  const [visualMode, setVisualMode] = useState<VisualMode>("cutaway");
  const visualModeRef = useRef<VisualMode>("cutaway");
  visualModeRef.current = visualMode;
  // Explicit 3D model view: off by default whenever a real generated concept
  // image exists — the image is the default visual, the GLB is manipulation.
  const [modelViewState, setModelViewState] = useState<
    "hidden" | "loading" | "active" | "unavailable"
  >("hidden");
  const modelViewRef = useRef(false);

  const paths = useMemo(() => delivery.pathways.slice(0, 4), [delivery.pathways]);
  const choices = useMemo(
    () => (delivery.blend ? [...paths, delivery.blend] : paths),
    [paths, delivery.blend],
  );
  const selected = choices.find((x) => x.id === selectedId) ?? null;
  const isBlend = Boolean(selected && delivery.blend?.id === selected.id);
  const selectedModelUrl = selected?.model_url ?? null;

  const linearSpecs = useMemo(() => {
    const map = new Map<string, LinearSpec | null>();
    for (const path of choices) {
      map.set(
        path.id,
        linearSpecFromText(objectiveText, path.label, path.summary, path.spiral_form),
      );
    }
    return map;
  }, [choices, objectiveText]);
  const selectedSpec = selected ? (linearSpecs.get(selected.id) ?? null) : null;

  const sceneSignature = useMemo(
    () => choices.map((c) => `${c.id}:${c.model_url ?? ""}:${JSON.stringify(c.model_spec)}`).join("|") + (objectiveText ?? ""),
    [choices, objectiveText],
  );

  // Manifestation clocks: the overview manifests once when realities erupt
  // from the tree; selecting a reality restarts ITS sequence so it can finish
  // manifesting inside the inspection field.
  useEffect(() => {
    overviewStartRef.current = performance.now();
    focusStartRef.current = performance.now();
    lastPhaseRef.current = "idle";
  }, [sceneSignature]);
  useEffect(() => {
    focusStartRef.current = performance.now();
    rotationRef.current = { x: -0.22, y: 0.55 };
    zoomRef.current = 1;
    lastPhaseRef.current = "idle";
    setPhase("possibility");
    setVisualMode("cutaway");
    modelViewRef.current = false;
    setModelViewState("hidden");
  }, [selectedId]);

  // Polling changes delivery objects. Reload only when the selected model's
  // identity or URL changes, so a slow GLB download survives status refreshes.
  useEffect(() => {
    publishGenerated(null);
    if (!selectedId || !selectedModelUrl) return;
    let cancelled = false;
    const controller = new AbortController();
    setModelViewState("loading");
    void (async () => {
      try {
        const response = await fetch(selectedModelUrl, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Model download returned HTTP ${response.status}`);
        const parsed = parseGlbVertices(await response.arrayBuffer());
        if (!parsed) throw new Error("Model contains no readable mesh");
        if (!cancelled) {
          publishGenerated({
            id: selectedId,
            mesh: parsed,
            url: selectedModelUrl,
          });
          setModelViewState("active");
        }
      } catch {
        if (!cancelled) setModelViewState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedId, selectedModelUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) {
      setWebglError(true);
      return;
    }
    const reducedMotion =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeScale = reducedMotion ? 6 : 1;
    const particles = seedParticles();

    let solidP: WebGLProgram, lineP: WebGLProgram, pointP: WebGLProgram;
    let cube: Mesh,
      torus: Mesh,
      sphere: Mesh,
      cylinder: Mesh,
      nozzle: Mesh,
      helixM: Mesh,
      orbitM: Mesh,
      arcM: Mesh;
    let cyanBuf: WebGLBuffer, goldBuf: WebGLBuffer, strandBuf: WebGLBuffer;
    let generatedBuf: WebGLBuffer | null = null,
      generatedCount = 0,
      generatedBuiltFor: Float32Array | null = null;
    // BLUEPRINT linework, derived from the exact triangle data each solid uses.
    type WirePair = { feature: Mesh; all: Mesh };
    const wires = new Map<Mesh, WirePair>();
    const buildWire = (data: Float32Array): WirePair => {
      const w = wireEdges(data);
      return { feature: lineMesh(gl, w.feature), all: lineMesh(gl, w.all) };
    };
    const assemblyCache = new Map(choices.map(path => [path.id, canonicalAssembly(objectiveText ?? "", path)]));
    const canonicalMeshes = new Map<Float32Array, Mesh>();
    for (const parts of assemblyCache.values()) for (const part of parts) {
      if (canonicalMeshes.has(part.vertices)) continue;
      const m = mesh(gl, part.vertices);
      canonicalMeshes.set(part.vertices, m);
      wires.set(m, buildWire(part.vertices));
    }
    // Generated Hunyuan3D linework, built when the model buffer is built.
    let generatedWire: {
      feature: WebGLBuffer;
      all: WebGLBuffer;
      featureCount: number;
      allCount: number;
      forMesh: Float32Array | null;
    } | null = null;
    let raf = 0,
      dead = false;
    const cyanData = new Float32Array(PARTICLES_PER_STATION * 5 * 5);
    const goldData = new Float32Array(PARTICLES_PER_STATION * 5 * 5);
    const strandData = new Float32Array(4 * 4);

    try {
      solidP = solidProgram(gl);
      lineP = lineProgram(gl);
      pointP = pointProgram(gl);
      cube = mesh(gl, cubeVertices());
      torus = mesh(gl, torusVertices());
      sphere = mesh(gl, sphereVertices());
      cylinder = mesh(gl, cylinderVertices());
      nozzle = mesh(gl, cylinderVertices(30, true));
      helixM = lineMesh(gl, helixVertices());
      orbitM = mesh(gl, orbitVertices());
      arcM = lineMesh(gl, arcVertices());
      cyanBuf = dynamicBuffer(gl);
      goldBuf = dynamicBuffer(gl);
      strandBuf = dynamicBuffer(gl);
      wires.set(cube, buildWire(cubeVertices()));
      wires.set(torus, buildWire(torusVertices()));
      wires.set(sphere, buildWire(sphereVertices()));
      wires.set(cylinder, buildWire(cylinderVertices()));
      wires.set(nozzle, buildWire(cylinderVertices(30, true)));
    } catch {
      setWebglError(true);
      return;
    }

    const su = {
      M: gl.getUniformLocation(solidP, "uM"),
      VP: gl.getUniformLocation(solidP, "uVP"),
      C: gl.getUniformLocation(solidP, "uC"),
      Eye: gl.getUniformLocation(solidP, "uEye"),
      Glow: gl.getUniformLocation(solidP, "uGlow"),
      Alpha: gl.getUniformLocation(solidP, "uAlpha"),
    };
    const saP = gl.getAttribLocation(solidP, "aP"),
      saN = gl.getAttribLocation(solidP, "aN");
    const lu = {
      M: gl.getUniformLocation(lineP, "uM"),
      VP: gl.getUniformLocation(lineP, "uVP"),
      C: gl.getUniformLocation(lineP, "uC"),
      Alpha: gl.getUniformLocation(lineP, "uAlpha"),
      Time: gl.getUniformLocation(lineP, "uTime"),
      Energy: gl.getUniformLocation(lineP, "uEnergy"),
    };
    const laP = gl.getAttribLocation(lineP, "aP"),
      laT = gl.getAttribLocation(lineP, "aT");
    const pu = {
      VP: gl.getUniformLocation(pointP, "uVP"),
      C: gl.getUniformLocation(pointP, "uC"),
      Alpha: gl.getUniformLocation(pointP, "uAlpha"),
      Scale: gl.getUniformLocation(pointP, "uScale"),
    };
    const paP = gl.getAttribLocation(pointP, "aP"),
      paS = gl.getAttribLocation(pointP, "aS"),
      paB = gl.getAttribLocation(pointP, "aB");

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const bindSolid = (buffer: WebGLBuffer) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(saP);
      gl.vertexAttribPointer(saP, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(saN);
      gl.vertexAttribPointer(saN, 3, gl.FLOAT, false, 24, 12);
    };
    const drawSolidCount = (
      buffer: WebGLBuffer,
      count: number,
      model: Float32Array,
      vp: Float32Array,
      color: Vec3,
      glow: number,
      alpha: number,
    ) => {
      if (alpha <= 0.004) return;
      bindSolid(buffer);
      gl.uniformMatrix4fv(su.M, false, model);
      gl.uniformMatrix4fv(su.VP, false, vp);
      gl.uniform3f(su.C, ...color);
      gl.uniform1f(su.Glow, glow);
      gl.uniform1f(su.Alpha, alpha);
      gl.drawArrays(gl.TRIANGLES, 0, count);
    };
    const drawSolid = (
      m: Mesh,
      model: Float32Array,
      vp: Float32Array,
      color: Vec3,
      glow: number,
      alpha: number,
    ) => drawSolidCount(m.buffer, m.count, model, vp, color, glow, alpha);
    const drawLines = (
      m: Mesh,
      model: Float32Array,
      vp: Float32Array,
      color: Vec3,
      alpha: number,
      energy: number,
      time: number,
      primitive: number = gl.LINE_STRIP,
    ) => {
      if (alpha <= 0.004 || energy <= 0.004) return;
      gl.useProgram(lineP);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer);
      gl.enableVertexAttribArray(laP);
      gl.vertexAttribPointer(laP, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(laT);
      gl.vertexAttribPointer(laT, 1, gl.FLOAT, false, 16, 12);
      gl.uniformMatrix4fv(lu.M, false, model);
      gl.uniformMatrix4fv(lu.VP, false, vp);
      gl.uniform3f(lu.C, ...color);
      gl.uniform1f(lu.Alpha, alpha);
      gl.uniform1f(lu.Energy, energy);
      gl.uniform1f(lu.Time, time);
      gl.drawArrays(primitive, 0, m.count);
      gl.useProgram(solidP);
    };
    /** Drafting stroke: steady linework drawn as GL LINES (wireframe pairs). */
    const drawDraft = (w: WirePair, model: Float32Array, vp: Float32Array, alpha: number) => {
      if (alpha <= 0.004) return;
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.2, 1.2);
      drawLines(w.feature, model, vp, [0.78, 0.93, 1], alpha, 1, 0, gl.LINES);
      drawLines(w.all, model, vp, [0.62, 0.85, 1], alpha * 0.055, 1, 0, gl.LINES);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    };
    const drawParticles = (
      buffer: WebGLBuffer,
      data: Float32Array,
      used: number,
      vp: Float32Array,
      color: Vec3,
      alpha: number,
      scale: number,
    ) => {
      if (used <= 0 || alpha <= 0.004) return;
      gl.useProgram(pointP);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, used * 5), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(paP);
      gl.vertexAttribPointer(paP, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(paS);
      gl.vertexAttribPointer(paS, 1, gl.FLOAT, false, 20, 12);
      gl.enableVertexAttribArray(paB);
      gl.vertexAttribPointer(paB, 1, gl.FLOAT, false, 20, 16);
      gl.uniformMatrix4fv(pu.VP, false, vp);
      gl.uniform3f(pu.C, ...color);
      gl.uniform1f(pu.Alpha, alpha);
      gl.uniform1f(pu.Scale, scale);
      gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, used);
      gl.depthMask(true);
      gl.useProgram(solidP);
    };

    const projector = (
      vp: Float32Array,
      base: Vec3,
      color: Vec3,
      size: number,
      focus: boolean,
      blend: boolean,
      drafting: boolean,
    ) => {
      const y = base[1] - (focus ? 1.15 : 0.78) * size;
      const ringColor: Vec3 = blend ? [0.95, 0.62, 0.18] : CYAN;
      const dishXf = compose(
        [base[0], y, base[2]],
        [0, 0, Math.PI / 2],
        [0.07 * size, 0.54 * size, 0.54 * size],
      );
      const goldRingXf = compose(
        [base[0], y + 0.05 * size, base[2]],
        [Math.PI / 2, 0, 0],
        [0.56 * size, 0.56 * size, 0.56 * size],
      );
      const hueRingXf = compose(
        [base[0], y + 0.11 * size, base[2]],
        [Math.PI / 2, 0, 0],
        [0.39 * size, 0.39 * size, 0.39 * size],
      );
      const spikeXf = compose(
        [base[0], y + 0.5 * size, base[2]],
        [0, 0, -Math.PI / 2],
        [0.4 * size, 0.3 * size, 0.3 * size],
      );
      if (drafting) {
        drawDraft(wires.get(cylinder)!, dishXf, vp, 0.6);
        drawDraft(wires.get(torus)!, goldRingXf, vp, 0.7);
        drawDraft(wires.get(torus)!, hueRingXf, vp, 0.55);
        drawDraft(wires.get(nozzle)!, spikeXf, vp, 0.45);
        if (focus)
          drawDraft(
            wires.get(torus)!,
            compose(
              [base[0], base[1] - 0.83 * size, base[2]],
              [Math.PI / 2, 0, 0],
              [0.88 * size, 0.88 * size, 0.88 * size],
            ),
            vp,
            0.3,
          );
        return;
      }
      const dishQuiet = focus ? 0.5 : 1;
      drawSolid(cylinder, dishXf, vp, BLUE_GLASS_DEEP, 0.24, 0.34 * dishQuiet);
      drawSolid(torus, goldRingXf, vp, blend ? ringColor : GOLD, 0.4, 0.55 * dishQuiet);
      drawSolid(torus, hueRingXf, vp, color, 0.3, 0.4 * dishQuiet);
      drawSolid(nozzle, spikeXf, vp, blend ? [0.98, 0.7, 0.2] : GOLD_DEEP, 0.14, 0.12 * dishQuiet);
      if (focus) {
        drawSolid(
          torus,
          compose(
            [base[0], base[1] - 0.83 * size, base[2]],
            [Math.PI / 2, 0, 0],
            [0.88 * size, 0.88 * size, 0.88 * size],
          ),
          vp,
          GOLD,
          0.34,
          0.42,
        );
      }
    };

    /**
     * ENVIRONMENT mode set dressing: the invention staged inside an ASCENSION
     * knowledge hall — glass enclosure, grand dais, engraved floor rings,
     * gilded columns and floating lantern orbs. Drawn around/behind the exhibit.
     */
    const environmentSet = (vp: Float32Array, base: Vec3, k: number, fade: number, _t: number) => {
      // ENVIRONMENT uses the existing ASCENSION Knowledge Hall artwork as the
      // world. Only a restrained physical exhibit pedestal is added here so the
      // SAME invention remains the subject instead of being buried in scenery.
      const y0 = base[1] - 0.78;

      // Broad polished black/blue plinth.
      drawSolid(
        cube,
        compose([base[0], y0, base[2] + 0.05], [0, 0, 0], [1.58 * k, 0.1, 0.88 * k]),
        vp,
        [0.018, 0.035, 0.055],
        0.08,
        0.98 * fade,
      );

      // Raised presentation deck.
      drawSolid(
        cube,
        compose([base[0], y0 + 0.14, base[2]], [0, 0, 0], [1.34 * k, 0.045, 0.68 * k]),
        vp,
        BLUE_GLASS_DEEP,
        0.12,
        0.96 * fade,
      );

      // Gold trim rails around the deck — static architectural detail, not energy.
      for (let q = -1; q <= 1; q += 2) {
        drawSolid(
          cube,
          compose([base[0], y0 + 0.2, base[2] + q * 0.64 * k], [0, 0, 0], [1.36 * k, 0.018, 0.018]),
          vp,
          GOLD,
          0.16,
          0.92 * fade,
        );
      }
      for (let q = -1; q <= 1; q += 2) {
        drawSolid(
          cube,
          compose([base[0] + q * 1.3 * k, y0 + 0.2, base[2]], [0, 0, 0], [0.018, 0.018, 0.66 * k]),
          vp,
          GOLD_DEEP,
          0.14,
          0.88 * fade,
        );
      }

      // Short structural feet like the approved exhibit render.
      for (let q = -1; q <= 1; q += 2) {
        drawSolid(
          cube,
          compose([base[0] + q * 0.95 * k, y0 + 0.34, base[2]], [0, 0, 0], [0.09, 0.2, 0.1]),
          vp,
          [0.08, 0.12, 0.17],
          0.08,
          0.95 * fade,
        );
      }
    };

    /**
     * Per-part manifestation state. Parts converge from scattered knowledge
     * fragments, then lock sequentially during the structural reveal.
     */
    const partState = (
      index: number,
      elapsedMs: number,
      seed: number,
      focus: boolean,
      fade: number,
    ) => {
      const ph = manifestationPhase(elapsedMs);
      const prog = phaseProgress(elapsedMs);
      const locked = elapsedMs >= partLockMs(index, seed);
      let converge: number,
        alpha: number,
        glowBoost = 0,
        visible = true;
      if (ph === "possibility") {
        converge = 0;
        alpha = 0.15;
        glowBoost = 0.3;
        visible = partHash(index, seed) < 0.5; // incomplete silhouette
      } else if (ph === "condensation") {
        converge = easeOutCubic(prog) * 0.82;
        alpha = lerp(0.15, 0.42, prog);
        glowBoost = 0.18;
      } else if (ph === "reveal") {
        const lock = partLockMs(index, seed);
        converge = locked
          ? 1
          : lerp(
              0.82,
              0.94,
              (elapsedMs - PHASE_BOUNDARY.reveal) / Math.max(1, lock - PHASE_BOUNDARY.reveal),
            );
        alpha = locked ? 1 : lerp(0.42, 0.7, prog);
        glowBoost = locked ? 0.06 : 0.1;
      } else {
        converge = 1;
        alpha = 1;
      }
      const dir = partScatterDir(index, seed);
      return {
        ph,
        locked,
        visible,
        offset: [
          dir[0] * (1 - converge) * 0.95,
          dir[1] * (1 - converge) * 0.95,
          dir[2] * (1 - converge) * 0.95,
        ] as Vec3,
        alpha: (ph === "stabilized" ? 1 : focus ? 0.98 : 0.9) * alpha * fade,
        glowBoost,
      };
    };

    const renderAssembly = (
      vp: Float32Array,
      path: Pathway,
      pos: Vec3,
      color: Vec3,
      active: boolean,
      t: number,
      index: number,
      clocks: { overview: number; focus: number },
      blend = false,
      visual: VisualMode = "cutaway",
    ) => {
      const focus = selectedRef.current !== null && active;
      const drafting = visual === "blueprint";
      const seed = index * 0.73 + 1;
      const rawElapsed = focus ? clocks.focus : clocks.overview;
      const elapsedMs = Math.max(0, rawElapsed - (focus ? 0 : index * STATION_STAGGER_MS));
      const stationPhase = manifestationPhase(elapsedMs);
      const prog = phaseProgress(elapsedMs);
      const fade = stationFadeRef.current[index] ?? 1;
      const zoom = focus ? zoomRef.current : 1;
      const kind = pathwayKind(path, objectiveText);
      const spec = blend ? null : (linearSpecs.get(path.id) ?? null);
      const semanticModel = path.model_spec;

      // ENVISION is 3D-only. Reference images are internal Hunyuan inputs and
      // are never rendered to the user. Canonical interpretive assemblies are
      // explicitly unverified until a delivered GLB supplies the generated mesh.
      const modelViewActive = focus && generatedRef.current?.id === path.id;


      // Focused realities glide from their overview slot into the inspection field.
      const glide = easeOutCubic(Math.min(1, (focus ? clocks.focus : 0) / 450));
      const base: Vec3 = focus
        ? [
            lerp(pos[0], FOCUS_BASE[0], glide),
            lerp(pos[1], FOCUS_BASE[1], glide),
            lerp(pos[2], FOCUS_BASE[2], glide),
          ]
        : pos;

      // Every new pathway can carry its own normalized 3D scene graph and
      // preferred inspection pose. That objective-specific model is authoritative.
      // Category geometry below is fallback only for older deliveries.
      const modelScale = semanticModel?.hero_scale ?? (kind === "linear" ? 1.22 : 1.02);
      const k = focus ? modelScale * zoom : 0.48;
      const animatedSpin = assemblySpin(elapsedMs / 1000, index);
      const hero = semanticModel?.hero_rotation ?? null;
      const semanticHeroY = hero ? hero[1] + (rotationRef.current.y - 0.55) : 0;
      const semanticHeroX = hero ? hero[0] + (rotationRef.current.x + 0.22) : 0;
      const semanticHeroZ = hero?.[2] ?? 0;
      const linearHero = -0.48 + (rotationRef.current.y - 0.55);
      const spin =
        focus && stationPhase === "stabilized" && hero
          ? semanticHeroY
          : focus && stationPhase === "stabilized" && kind === "linear"
            ? linearHero
            : animatedSpin + (focus ? rotationRef.current.y - 0.45 : 0);
      const idle = 0;
      const linearPitch = -0.13 + (rotationRef.current.x + 0.22);
      const pitch =
        focus && stationPhase === "stabilized" && hero
          ? semanticHeroX
          : focus && stationPhase === "stabilized" && kind === "linear"
            ? linearPitch
            : (focus ? rotationRef.current.x : -0.12) +
              (stationPhase === "stabilized" ? idle * 0.5 : idle * 0.2);
      const glowBase =
        stationPhase === "possibility"
          ? 0.52
          : stationPhase === "condensation"
            ? 0.4
            : stationPhase === "reveal"
              ? 0.32
              : 0.2;

      // Coherent assembly transform: the WHOLE model rotates as one.
      let stationRot = translate(base[0], base[1], base[2]);
      stationRot = matMul(stationRot, rotY(spin));
      stationRot = matMul(stationRot, rotX(pitch));
      if (modelViewActive) stationRot = matMul(stationRot, compose([0, 0, 0], [0, 0, 0], [zoom, zoom, zoom]));
      if (focus && stationPhase === "stabilized" && semanticModel) {
        stationRot = matMul(stationRot, rotZ(semanticHeroZ));
      }

      let partIndex = 0;
      const model = (m: Mesh, pLocal: Vec3, rot: Vec3, s: Vec3, col: Vec3, g = glowBase, a = 1) => {
        const state = partState(partIndex, elapsedMs, seed, focus, fade);
        partIndex++;
        if (!state.visible) return;
        const p2: Vec3 = [
          pLocal[0] + state.offset[0],
          pLocal[1] + state.offset[1],
          pLocal[2] + state.offset[2],
        ];
        const xf = matMul(stationRot, compose(p2, rot, s));
        if (drafting) {
          // BLUEPRINT: technical linework of the same part. A faint glass fill
          // gives hidden-line depth; the drafting strokes carry the shape.
          drawSolid(m, xf, vp, [0.05, 0.13, 0.24], 0, state.alpha * 0.3);
          const w = wires.get(m);
          if (w) drawDraft(w, xf, vp, state.alpha * 0.95);
          return;
        }
        drawSolid(m, xf, vp, col, g + state.glowBoost, state.alpha * a);
      };

      // The projector anchors the overview stations; in focused inspection it
      // steps aside so the invention stays the star (the environment dais
      // takes over as the pedestal).
      if (!focus) projector(vp, base, color, 0.68, false, blend, drafting);

      // Decorative energy-flow effects intentionally removed. The manifested reality is the visual subject.

      // ENVIRONMENT: chamber set dressing staged behind the exhibit.
      if (visual === "environment" && focus) environmentSet(vp, base, k, fade, t);

      // Objective-specific 3D scene graph generated from THIS pathway.
      // CUTAWAY renders the solid parts, BLUEPRINT routes the exact same parts
      // through model()'s drafting branch, and ENVIRONMENT stages those same
      // parts in the hall. No question-specific renderer code is needed.
      if (!modelViewActive) {
        for (const part of assemblyCache.get(path.id) ?? []) {
          // Use the original vertex buffers and model() manifestation/drafting pipeline.
          const m = canonicalMeshes.get(part.vertices);
          if (!m) continue;
          model(m, part.position.map(v=>v*k) as Vec3, part.rotation, part.scale.map(v=>v*k) as Vec3, part.color, .12, 1);
        }
      }

      // A generated Hunyuan3D model, once fetched and parsed, becomes the
      // stabilized form. It never replaces the manifestation energy itself.
      const generated = generatedRef.current;
      if (
        focus &&
        (modelViewActive || (!semanticModel && kind !== "linear")) &&
        generated &&
        generated.id === path.id &&
        stationPhase !== "possibility" &&
        stationPhase !== "condensation"
      ) {
        if (generatedBuiltFor !== generated.mesh || !generatedBuf) {
          if (!generatedBuf) generatedBuf = dynamicBuffer(gl);
          const min: Vec3 = [1e9, 1e9, 1e9],
            max: Vec3 = [-1e9, -1e9, -1e9];
          for (let i = 0; i < generated.mesh.length; i += 6) {
            for (let a = 0; a < 3; a++) {
              const v = generated.mesh[i + a] ?? 0;
              min[a] = Math.min(min[a] ?? 0, v);
              max[a] = Math.max(max[a] ?? 0, v);
            }
          }
          const center: Vec3 = [
            (min[0] + max[0]) / 2,
            (min[1] + max[1]) / 2,
            (min[2] + max[2]) / 2,
          ];
          const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
          const s = 4.6 / extent;
          const src = generated.mesh;
          const normalized = new Float32Array(src.length);
          for (let i = 0; i < src.length; i += 6) {
            normalized[i] = ((src[i] ?? 0) - center[0]) * s;
            normalized[i + 1] = ((src[i + 1] ?? 0) - center[1]) * s;
            normalized[i + 2] = ((src[i + 2] ?? 0) - center[2]) * s;
            normalized[i + 3] = src[i + 3] ?? 0;
            normalized[i + 4] = src[i + 4] ?? 0;
            normalized[i + 5] = src[i + 5] ?? 0;
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, generatedBuf);
          gl.bufferData(gl.ARRAY_BUFFER, normalized, gl.STATIC_DRAW);
          generatedCount = normalized.length / 6;
          generatedBuiltFor = generated.mesh;
          // BLUEPRINT linework for the generated mesh, from its own triangles.
          if (generatedWire) {
            gl.deleteBuffer(generatedWire.feature);
            gl.deleteBuffer(generatedWire.all);
          }
          const gw = wireEdges(normalized);
          generatedWire = {
            feature: dynamicBuffer(gl),
            all: dynamicBuffer(gl),
            featureCount: gw.feature.length / 4,
            allCount: gw.all.length / 4,
            forMesh: generated.mesh,
          };
          gl.bindBuffer(gl.ARRAY_BUFFER, generatedWire.feature);
          gl.bufferData(gl.ARRAY_BUFFER, gw.feature, gl.STATIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, generatedWire.all);
          gl.bufferData(gl.ARRAY_BUFFER, gw.all, gl.STATIC_DRAW);
        }
        const alpha =
          (stationPhase === "reveal" ? lerp(0.5, 1, prog) : 1) *
          (focus && stationPhase === "stabilized" ? 1 : focus ? 0.98 : 0.84) *
          fade;
        if (drafting && generatedWire && generatedWire.forMesh === generated.mesh) {
          gl.bindBuffer(gl.ARRAY_BUFFER, generatedBuf);
          gl.enableVertexAttribArray(saP);
          gl.vertexAttribPointer(saP, 3, gl.FLOAT, false, 24, 0);
          gl.enableVertexAttribArray(saN);
          gl.vertexAttribPointer(saN, 3, gl.FLOAT, false, 24, 12);
          gl.uniformMatrix4fv(su.M, false, stationRot);
          gl.uniformMatrix4fv(su.VP, false, vp);
          gl.uniform3f(su.C, 0.05, 0.13, 0.24);
          gl.uniform1f(su.Glow, 0);
          gl.uniform1f(su.Alpha, alpha * 0.3);
          gl.enable(gl.POLYGON_OFFSET_FILL);
          gl.polygonOffset(1.2, 1.2);
          gl.drawArrays(gl.TRIANGLES, 0, generatedCount);
          gl.disable(gl.POLYGON_OFFSET_FILL);
          gl.useProgram(lineP);
          gl.enable(gl.BLEND);
          const stroke = (buf: WebGLBuffer, count: number, col: Vec3, a: number) => {
            if (a <= 0.004) return;
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.enableVertexAttribArray(laP);
            gl.vertexAttribPointer(laP, 3, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(laT);
            gl.vertexAttribPointer(laT, 1, gl.FLOAT, false, 16, 12);
            gl.uniformMatrix4fv(lu.M, false, stationRot);
            gl.uniformMatrix4fv(lu.VP, false, vp);
            gl.uniform3f(lu.C, ...col);
            gl.uniform1f(lu.Alpha, a);
            gl.uniform1f(lu.Energy, 1);
            gl.uniform1f(lu.Time, 0);
            gl.drawArrays(gl.LINES, 0, count);
          };
          stroke(generatedWire.feature, generatedWire.featureCount, [0.78, 0.93, 1], alpha * 0.95);
          stroke(generatedWire.all, generatedWire.allCount, [0.62, 0.85, 1], alpha * 0.16);
          gl.useProgram(solidP);
        } else {
          drawSolidCount(
            generatedBuf,
            generatedCount,
            stationRot,
            vp,
            [0.52, 0.76, 1],
            glowBase + 0.3,
            alpha,
          );
        }
      }
    };

    const render = (ms: number) => {
      if (dead) return;
      const t = ms * 0.001;
      const rect = canvas.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2),
        w = Math.max(1, Math.round(rect.width * dpr)),
        h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const eye: Vec3 = [
        selectedRef.current ? 0 : Math.sin(t * 0.08) * 0.12,
        selectedRef.current ? 0 : Math.sin(t * 0.1) * 0.04,
        10.4,
      ];
      const vp = matMul(
        perspective(Math.PI / 4.3, w / h, 0.1, 40),
        lookAt(eye, [0, 0, 0], [0, 1, 0]),
      );
      gl.useProgram(solidP);
      gl.uniform3f(su.Eye, ...eye);

      const clocks = {
        overview: Math.max(0, performance.now() - overviewStartRef.current) * timeScale,
        focus: Math.max(0, performance.now() - focusStartRef.current) * timeScale,
      };
      const focused = selectedRef.current;
      const focusIndex = focused ? paths.findIndex((x) => x.id === focused) : -1;
      const focusPath = focusIndex >= 0 ? (paths[focusIndex] ?? null) : null;
      const focusBlend = !focusPath && focused != null && delivery.blend?.id === focused;

      // Phase transitions drive the sound timeline exactly once each.
      const primaryElapsed = focusPath || focusBlend ? clocks.focus : clocks.overview;
      const primaryPhase = manifestationPhase(primaryElapsed);
      if (primaryPhase !== lastPhaseRef.current) {
        lastPhaseRef.current = primaryPhase;
        if (primaryPhase !== "idle")
          onPhaseChangeRef.current?.(primaryPhase, {
            blend: Boolean(focusBlend),
          });
        setPhase(primaryPhase);
      }

      // Cinematic fade: unselected realities recede, the selected one emerges.
      const fadeTargets = [0, 1, 2, 3].map((i) => (!focused || paths[i]?.id === focused ? 1 : 0.1));
      fadeTargets.push(!focused || delivery.blend?.id === focused ? 1 : 0.1);
      for (let i = 0; i < stationFadeRef.current.length; i++) {
        const cur = stationFadeRef.current[i] ?? 1;
        stationFadeRef.current[i] = cur + ((fadeTargets[i] ?? 1) - cur) * Math.min(1, 0.09);
      }

      if (focused) {
        const visual = visualModeRef.current;
        if (focusPath && focusIndex >= 0) {
          const slot = PATH_SLOTS[focusIndex]?.pos ?? [0, 0, 0];
          renderAssembly(
            vp,
            focusPath,
            slot,
            hue(focusIndex),
            true,
            t,
            focusIndex,
            clocks,
            false,
            visual,
          );
        } else if (delivery.blend && focusBlend) {
          renderAssembly(
            vp,
            delivery.blend,
            BLEND_POS,
            [1, 0.66, 0.18],
            true,
            t,
            4,
            clocks,
            true,
            visual,
          );
        }
      } else {
        paths.forEach((path, i) => {
          const pos = PATH_SLOTS[i]?.pos ?? [0, 0, 0];
          renderAssembly(vp, path, pos, hue(i), false, t, i, clocks, false);
        });
        if (delivery.blend) {
          renderAssembly(vp, delivery.blend, BLEND_POS, [1, 0.66, 0.18], false, t, 4, clocks, true);
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      [cube, torus, sphere, cylinder, nozzle].forEach((m) => gl.deleteBuffer(m.buffer));
      for (const m of canonicalMeshes.values()) gl.deleteBuffer(m.buffer);
      [helixM, arcM, orbitM].forEach((m) => gl.deleteBuffer(m.buffer));
      for (const w of wires.values()) {
        gl.deleteBuffer(w.feature.buffer);
        gl.deleteBuffer(w.all.buffer);
      }
      [cyanBuf, goldBuf, strandBuf].forEach((b) => gl.deleteBuffer(b));
      if (generatedBuf) gl.deleteBuffer(generatedBuf);
      if (generatedWire) {
        gl.deleteBuffer(generatedWire.feature);
        gl.deleteBuffer(generatedWire.all);
      }
      [solidP, lineP, pointP].forEach((p) => gl.deleteProgram(p));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneSignature]);

  const pointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!selectedId) return;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      active: true,
      moved: false,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (pinchRef.current.has(e.pointerId))
      pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchRef.current.size === 2) {
      const points = [...pinchRef.current.values()];
      const a = points[0],
        b = points[1];
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistRef.current !== null && pinchDistRef.current > 0) {
        zoomRef.current = Math.min(
          1.85,
          Math.max(0.65, zoomRef.current * (dist / pinchDistRef.current)),
        );
      }
      pinchDistRef.current = dist;
      return;
    }
    const d = dragRef.current;
    if (!d.active || !selectedId) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
    rotationRef.current.y += dx * 0.009;
    rotationRef.current.x += dy * 0.009;
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const pointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    pinchRef.current.delete(e.pointerId);
    if (pinchRef.current.size < 2) pinchDistRef.current = null;
    dragRef.current.active = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // The capture may already be gone when the pointer was cancelled.
    }
  };
  const wheel = (e: WheelEvent<HTMLCanvasElement>) => {
    if (!selectedId) return;
    e.preventDefault();
    zoomRef.current = Math.min(1.85, Math.max(0.65, zoomRef.current - e.deltaY * 0.001));
  };

  // Explicit 3D model view: resolves the real GLB (Hunyuan3D completion or a
  // configured endpoint) and renders it instead of the concept image. If no
  // GLB is reachable, the image stays and the state says so honestly.
  const enterModelView = () => {
    const request = choices.find((x) => x.id === selectedId);
    if (!request) return;
    if (generatedRef.current?.id === request.id) {
      modelViewRef.current = true;
      setModelViewState("active");
      return;
    }
    setModelViewState("loading");
    void (async () => {
      try {
        const model: PathwayModel | null = request.model_url
          ? { kind: "gltf", url: request.model_url }
          : null;
        if (!model) {
          setModelViewState("unavailable");
          return;
        }
        const response = await fetch(model.url);
        if (!response.ok) {
          setModelViewState("unavailable");
          return;
        }
        const parsed = parseGlbVertices(await response.arrayBuffer());
        if (!parsed) {
          setModelViewState("unavailable");
          return;
        }
        publishGenerated({ id: request.id, mesh: parsed, url: model.url });
        modelViewRef.current = true;
        setModelViewState("active");
      } catch {
        setModelViewState("unavailable");
      }
    })();
  };
  const phaseLabel = MANIFESTATION_PHASE_LABEL[phase];
  const hasReal3D = Boolean(selected && generated?.id === selected.id);
  const modelStatusLabel =
    selected?.model_status === "failed"
      ? "3D FAILED"
      : selectedModelUrl
        ? modelViewState === "unavailable"
          ? "3D COULD NOT LOAD"
          : "3D LOADING"
        : selected?.model_status === "running"
          ? "3D GENERATING"
          : selected?.model_status === "claimed"
            ? "3D PREPARING"
            : selected?.model_status === "queued"
              ? "3D QUEUED"
              : "3D NOT AVAILABLE";
  const modeHint = !hasReal3D
    ? `CONCEPT / UNVERIFIED · ${selected && pathwayKind(selected, objectiveText) === "generic" && !selected.model_spec ? "INTERPRETIVE DIAGRAM · PHYSICAL GEOMETRY UNAVAILABLE" : "SEMANTIC ASSEMBLY"} · ${modelStatusLabel}`
    : visualMode === "blueprint"
      ? "BLUEPRINT · SAME 3D REALITY · DRAG TO ROTATE · SCROLL TO ZOOM"
      : visualMode === "environment"
        ? "ENVIRONMENT · SAME 3D REALITY · DRAG TO ROTATE · SCROLL TO ZOOM"
        : "CUTAWAY · SAME 3D REALITY · DRAG TO ROTATE · SCROLL TO ZOOM";

  return (
    <div
      className="ascension-envision-3d"
      data-focused={selectedId ? "true" : "false"}
      data-phase={phase}
      data-mode={selected ? visualMode : "cutaway"}
      data-model-view={selected ? modelViewState : "hidden"}
    >
      <canvas
        ref={canvasRef}
        className={dragging ? "is-dragging" : ""}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onWheel={wheel}
        aria-label="Interactive 3D holographic ENVISION scene"
      />
      <div className="ascension-envision-heading">
        <span>ENVISION · {hasReal3D ? "GENERATED / UNVERIFIED" : "CONCEPT / UNVERIFIED"}</span>
        <strong data-phase={phase}>
          {selected ? (phase === "stabilized" ? modeHint : phaseLabel) : phaseLabel}
        </strong>
        {selected && !isBlend && selectedSpec?.label && (
          <em className="ascension-holo-spec">{selectedSpec.label}</em>
        )}
      </div>
      {selected && visualMode === "blueprint" && (
        <div className="ascension-blueprint-plate" aria-hidden="true">
          <i className="ascension-bp-corner ascension-bp-corner--tl" />
          <i className="ascension-bp-corner ascension-bp-corner--tr" />
          <i className="ascension-bp-corner ascension-bp-corner--bl" />
          <i className="ascension-bp-corner ascension-bp-corner--br" />
          <div className="ascension-bp-titleblock">
            <strong>{selected.label}</strong>
            <span>
              ASCENSION · ENVISION TECHNICAL PLATE ·{" "}
              {selectedSpec?.label ?? "IDENTIFIED SPECIMEN DRAWING"}
              {selected.outcome_score !== null
                ? ` · OUTCOME ${Math.round(selected.outcome_score * 100)}%`
                : ""}
            </span>
          </div>
        </div>
      )}
      {!selected &&
        paths.map((path, i) => (
          <Button
            key={path.id}
            className="ascension-holo-hit"
            style={{ left: PATH_SLOTS[i]?.left, top: PATH_SLOTS[i]?.labelTop }}
            onClick={() => onSelect(path.id)}
          >
            <span>PATH {String(i + 1).padStart(2, "0")}</span>
            <strong>{path.label}</strong>
            {path.outcome_score !== null && <em>{Math.round(path.outcome_score * 100)}%</em>}
          </Button>
        ))}
      {!selected && delivery.blend && (
        <Button
          className="ascension-holo-hit ascension-holo-hit--blend"
          style={{ left: "50%", top: "61%" }}
          onClick={() => { if (delivery.blend) onSelect(delivery.blend.id); }}
        >
          <span>BLEND REALITIES</span>
          <strong>SPIRAL + OUTCOME</strong>
          {delivery.blend.outcome_score !== null && (
            <em>{Math.round(delivery.blend.outcome_score * 100)}%</em>
          )}
        </Button>
      )}
      {webglError && (
        <div className="ascension-holo-error">3D acceleration is unavailable in this browser.</div>
      )}
      {selected && (
        <div
          className={
            isBlend ? "ascension-holo-focus ascension-holo-focus--blend" : "ascension-holo-focus"
          }
        >
          <div className="ascension-mode-switch" role="tablist" aria-label="Presentation mode">
            {(["cutaway", "blueprint", "environment"] as const).map((m) => (
              <Button
                key={m}
                type="button"
                role="tab"
                aria-selected={visualMode === m}
                data-active={visualMode === m ? "true" : undefined}
                onClick={() => setVisualMode(m)}
              >
                {m.toUpperCase()}
              </Button>
            ))}
          </div>
          <div>
            <p>
              {isBlend
                ? "BLEND REALITY"
                : generated && generated.id === selected.id
                  ? "HUNYUAN3D REALITY · GENERATED MODEL"
                  : "CONCEPT / UNVERIFIED"}
            </p>
            <h3>{selected.label}</h3>
            <span>{selected.summary}</span>
            {selected.model_error && <p role="alert">{selected.model_error}</p>}
          </div>
          <div className="ascension-holo-actions">
            <Button
              onClick={() => {
                rotationRef.current = { x: -0.22, y: 0.55 };
                zoomRef.current = 1;
              }}
            >
              RESET VIEW
            </Button>
            <Button onClick={() => onSelect(null)}>BACK</Button>
            {generated?.id === selected.id ? (
              <Button onClick={enterModelView}>3D READY</Button>
            ) : (
              <Button
                type="button"
                disabled={modelViewState !== "unavailable"}
                onClick={enterModelView}
              >
                {modelViewState === "unavailable" && selectedModelUrl
                  ? "RETRY MODEL LOAD"
                  : modelStatusLabel}
              </Button>
            )}
            {generated && generated.id === selected.id && (
              <a
                className="ascension-holo-model"
                href={generated.url}
                target="_blank"
                rel="noreferrer"
              >
                MODEL
              </a>
            )}
            <Button onClick={() => onUse(selected, visualMode)}>
              {isBlend ? "ENTER BLEND" : "ENTER REALITY"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
