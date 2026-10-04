import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
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
import {
  parseGlbVertices,
  resolvePathwayModel,
  type PathwayModel,
} from "@/lib/ascension/model-provider";

type Pathway = ObjectiveDelivery["pathways"][number];
type Props = {
  delivery: ObjectiveDelivery;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUse: (pathway: Pathway) => void;
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
  { left: "24%", top: "62%", labelTop: "76%", pos: [-2.35, -1.18, 0.14] as Vec3 },
  { left: "76%", top: "62%", labelTop: "76%", pos: [2.35, -1.18, 0.14] as Vec3 },
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
    return { p: [(R + r * cw) * cu, (R + r * cw) * su, r * sw], n: [cw * cu, cw * su, sw] };
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

type HoloKind = "turbofan" | "rocket" | "ion" | "linear" | "plasma" | "fluid" | "generic";
function pathwayKind(path: Pathway): HoloKind {
  const text = `${path.label} ${path.summary} ${path.spiral_form ?? ""}`.toLowerCase();
  if (/turbofan|turbine|jet engine|compressor|bypass/.test(text)) return "turbofan";
  if (/rocket|combustion chamber|nozzle/.test(text)) return "rocket";
  if (/ion thruster|ion propulsion|electrostatic/.test(text)) return "ion";
  if (/linear|rail|coil|maglev|electromagnetic rail|induction/.test(text)) return "linear";
  if (/plasma/.test(text)) return "plasma";
  if (/fluid|hydraulic|pneumatic/.test(text)) return "fluid";
  return "generic";
}

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
    `precision mediump float;uniform vec3 uC;uniform vec3 uEye;uniform float uGlow;uniform float uAlpha;varying vec3 vN;varying vec3 vW;void main(){vec3 n=normalize(vN),l=normalize(vec3(-.45,.72,.68)),v=normalize(uEye-vW);float d=max(dot(n,l),0.0),rim=pow(1.0-max(dot(n,v),0.0),2.4),heart=pow(max(dot(n,v),0.0),2.2);float scan=.97+.03*sin((vW.y+vW.x*.14)*30.0);vec3 gold=vec3(1.0,.82,.44);vec3 c=uC*(.30+d*.40)+mix(uC,gold,.38)*rim*(.55+uGlow*.5)+vec3(1.0,.9,.66)*heart*(.05+uGlow*.13);c+=vec3(.03,.10,.15)*uGlow*.16;gl_FragColor=vec4(min(c,vec3(.97)),uAlpha);}`,
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
  const rotationRef = useRef({ x: -0.18, y: 0.45 });
  const zoomRef = useRef(1);
  const dragRef = useRef<{ x: number; y: number; active: boolean; moved: boolean }>({
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
  const generatedRef = useRef<{ id: string; mesh: Float32Array; url: string } | null>(null);
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

  const paths = useMemo(() => delivery.pathways.slice(0, 4), [delivery.pathways]);
  const choices = useMemo(
    () => (delivery.blend ? [...paths, delivery.blend] : paths),
    [paths, delivery.blend],
  );
  const selected = choices.find((x) => x.id === selectedId) ?? null;
  const isBlend = Boolean(selected && delivery.blend?.id === selected.id);

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

  const sceneSignature = useMemo(() => choices.map((c) => c.id).join("|"), [choices]);

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
    rotationRef.current = { x: -0.18, y: 0.45 };
    zoomRef.current = 1;
    lastPhaseRef.current = "idle";
    setPhase("possibility");
  }, [selectedId]);

  // Hunyuan3D adapter: only fetches when an endpoint is actually configured;
  // any failure keeps the procedural hologram without waiting or pretending.
  useEffect(() => {
    if (!selectedId || isBlend) return;
    let cancelled = false;
    const controller = new AbortController();
    const request = choices.find((x) => x.id === selectedId);
    if (!request) return;
    void (async () => {
      const model: PathwayModel | null = await resolvePathwayModel(
        {
          id: request.id,
          label: request.label,
          summary: request.summary,
          spiralForm: request.spiral_form,
        },
        controller.signal,
      );
      if (!model || cancelled) return;
      try {
        const response = await fetch(model.url, { signal: controller.signal });
        if (!response.ok) return;
        const parsed = parseGlbVertices(await response.arrayBuffer());
        if (parsed && !cancelled)
          publishGenerated({ id: request.id, mesh: parsed, url: model.url });
      } catch {
        /* keep the procedural hologram */
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedId, isBlend, choices]);
  useEffect(() => {
    publishGenerated(null);
  }, [sceneSignature]);

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
      gl.drawArrays(gl.LINE_STRIP, 0, m.count);
      gl.useProgram(solidP);
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
    ) => {
      const y = base[1] - (focus ? 1.15 : 0.78) * size;
      const ringColor: Vec3 = blend ? [0.95, 0.62, 0.18] : CYAN;
      // Gilded podium dish: blue-glass body framed in gold, echoing the artwork base.
      drawSolid(
        cylinder,
        compose(
          [base[0], y, base[2]],
          [0, 0, Math.PI / 2],
          [0.07 * size, 0.54 * size, 0.54 * size],
        ),
        vp,
        BLUE_GLASS_DEEP,
        0.24,
        0.55,
      );
      drawSolid(
        torus,
        compose(
          [base[0], y + 0.05 * size, base[2]],
          [Math.PI / 2, 0, 0],
          [0.56 * size, 0.56 * size, 0.56 * size],
        ),
        vp,
        blend ? ringColor : GOLD,
        0.4,
        0.7,
      );
      drawSolid(
        torus,
        compose(
          [base[0], y + 0.11 * size, base[2]],
          [Math.PI / 2, 0, 0],
          [0.39 * size, 0.39 * size, 0.39 * size],
        ),
        vp,
        color,
        0.3,
        0.55,
      );
      drawSolid(
        nozzle,
        compose(
          [base[0], y + 0.52 * size, base[2]],
          [0, 0, -Math.PI / 2],
          [0.5 * size, 0.42 * size, 0.42 * size],
        ),
        vp,
        blend ? [0.98, 0.7, 0.2] : GOLD_DEEP,
        0.2,
        0.34,
      );
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
        alpha: (focus && ph === "stabilized" ? 1 : focus ? 0.98 : 0.84) * alpha * fade,
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
    ) => {
      const focus = selectedRef.current !== null && active;
      const seed = index * 0.73 + 1;
      const rawElapsed = focus ? clocks.focus : clocks.overview;
      const elapsedMs = Math.max(0, rawElapsed - (focus ? 0 : index * STATION_STAGGER_MS));
      const stationPhase = manifestationPhase(elapsedMs);
      const prog = phaseProgress(elapsedMs);
      const fade = stationFadeRef.current[index] ?? 1;
      const zoom = focus ? zoomRef.current : 1;
      // Focused realities glide from their overview slot into the inspection field.
      const glide = easeOutCubic(Math.min(1, (focus ? clocks.focus : 0) / 450));
      const base: Vec3 = focus
        ? [
            lerp(pos[0], FOCUS_BASE[0], glide),
            lerp(pos[1], FOCUS_BASE[1], glide),
            lerp(pos[2], FOCUS_BASE[2], glide),
          ]
        : pos;
      const k = focus ? 1.02 * zoom : 0.48;
      const spin =
        assemblySpin(elapsedMs / 1000, index) + (focus ? rotationRef.current.y - 0.45 : 0);
      const idle = Math.sin(t * 0.8) * 0.02;
      const pitch =
        (focus ? rotationRef.current.x : -0.12) +
        (stationPhase === "stabilized" ? idle * 0.5 : idle * 0.2);
      const glowBase =
        stationPhase === "possibility"
          ? 0.52
          : stationPhase === "condensation"
            ? 0.4
            : stationPhase === "reveal"
              ? 0.32
              : 0.2;
      const kind = blend ? "generic" : pathwayKind(path);
      const spec = blend ? null : (linearSpecs.get(path.id) ?? null);

      // Coherent assembly transform: the WHOLE model rotates as one.
      let stationRot = translate(base[0], base[1], base[2]);
      stationRot = matMul(stationRot, rotY(spin));
      stationRot = matMul(stationRot, rotX(pitch));

      let partIndex = 0;
      const model = (
        m: Mesh,
        pLocal: Vec3,
        rot: Vec3,
        s: Vec3,
        col: Vec3,
        g = glowBase,
        a = 0.8,
      ) => {
        const state = partState(partIndex, elapsedMs, seed, focus, fade);
        partIndex++;
        if (!state.visible) return;
        const p2: Vec3 = [
          pLocal[0] + state.offset[0],
          pLocal[1] + state.offset[1],
          pLocal[2] + state.offset[2],
        ];
        drawSolid(
          m,
          matMul(stationRot, compose(p2, rot, s)),
          vp,
          col,
          g + state.glowBoost,
          state.alpha,
        );
      };

      projector(vp, base, color, focus ? 1.1 : 0.92, focus, blend);

      // Field arcs: strong while energy is loose, faint once stabilized.
      const arcEnergy =
        stationPhase === "possibility"
          ? 1
          : stationPhase === "condensation"
            ? lerp(1, 0.55, prog)
            : stationPhase === "reveal"
              ? lerp(0.55, 0.3, prog)
              : 0.16;
      const arcScale = focus ? 1.25 : 0.95;
      drawLines(
        arcM,
        compose(
          [base[0], base[1] - (focus ? 1.15 : 0.78) * 0.92, base[2]],
          [0, 0, 0],
          [arcScale, arcScale, arcScale],
        ),
        vp,
        blend ? [0.98, 0.72, 0.2] : [0.24, 0.8, 0.96],
        0.5,
        arcEnergy * (focus ? 1 : 0.85) * fade,
        t,
      );

      // Woven filaments ride the assembly spin — knowledge weaving the form.
      const helixEnergy =
        stationPhase === "possibility"
          ? 0.9
          : stationPhase === "condensation"
            ? 0.7
            : stationPhase === "reveal"
              ? 0.5
              : 0.24;
      drawLines(
        helixM,
        stationRot,
        vp,
        blend ? [1, 0.7, 0.18] : [1, 0.74, 0.3],
        0.42,
        helixEnergy * fade,
        t,
      );

      // Ornamental gold orbit rings, echoing the artwork's rings around the
      // canopy. They ride their own slow drift so the assembly feels forged
      // from the same material as the Tree.
      const orbitRing = (radius: number, tiltX: number, tiltZ: number, alpha: number) => {
        drawSolid(
          orbitM,
          matMul(
            stationRot,
            compose([0, 0, 0], [Math.PI / 2 + tiltX, 0, tiltZ], [radius, radius, radius]),
          ),
          vp,
          GOLD,
          0.36,
          alpha * fade,
        );
      };
      const orbitEnergy = stationPhase === "stabilized" ? 0.4 : 0.3 + 0.12 * Math.sin(t * 1.3);
      orbitRing(1.42 * k, 0.42 + Math.sin(t * 0.21) * 0.05, 0.18, orbitEnergy);
      orbitRing(1.68 * k, -0.3 + Math.cos(t * 0.17) * 0.05, -0.42, orbitEnergy * 0.7);

      // Manifestation flash when the sequence starts.
      if (elapsedMs < 650) {
        const ft = Math.max(0, Math.min(1, elapsedMs / 650));
        const fr = (0.3 + 1.7 * easeOutCubic(ft)) * (focus ? 1.5 : 1);
        drawSolid(
          torus,
          compose([base[0], base[1], base[2]], [Math.PI / 2, 0, 0], [fr, fr, fr]),
          vp,
          blend ? [1, 0.66, 0.18] : [0.2, 0.9, 1],
          0.6,
          (1 - ft) * 0.5 * fade,
        );
      }

      if (blend) {
        // BLEND fusion: source realities spiral inward, components interlock, gold synthesis settles.
        const converge =
          stationPhase === "possibility"
            ? 0
            : stationPhase === "condensation"
              ? easeOutCubic(prog)
              : 1;
        const sourceR = lerp(1.5, 0.18, converge);
        for (let src = 0; src < 2; src++) {
          const ang = assemblySpin(elapsedMs / 1000, src) * 1.35 + src * Math.PI;
          const sPos: Vec3 = [
            base[0] + Math.cos(ang) * sourceR,
            base[1] + Math.sin(ang * 0.5) * 0.22,
            base[2] + Math.sin(ang) * sourceR * 0.6,
          ];
          const sAlpha =
            (stationPhase === "possibility"
              ? 0.3
              : stationPhase === "condensation"
                ? lerp(0.3, 0.1, prog)
                : lerp(0.1, 0, Math.min(1, prog * 2))) * fade;
          if (sAlpha > 0.01) {
            const srcRot = matMul(
              translate(sPos[0], sPos[1], sPos[2]),
              matMul(rotY(spin * 1.6 + src), rotX(pitch)),
            );
            if (src === 0) {
              for (let q = -1; q <= 1; q += 2)
                drawSolid(
                  cube,
                  matMul(srcRot, compose([0, q * 0.34, 0], [0, 0, 0], [1.1, 0.03, 0.03])),
                  vp,
                  ICE,
                  0.4,
                  sAlpha,
                );
              for (let ring = -1; ring <= 1; ring++)
                drawSolid(
                  torus,
                  matMul(
                    srcRot,
                    compose([ring * 0.4, 0, 0], [Math.PI / 2, 0, 0], [0.26, 0.26, 0.26]),
                  ),
                  vp,
                  GOLD,
                  0.4,
                  sAlpha,
                );
            } else {
              drawSolid(
                cylinder,
                matMul(srcRot, compose([-0.2, 0, 0], [0, 0, 0], [0.42, 0.3, 0.3])),
                vp,
                BLUE_GLASS,
                0.4,
                sAlpha,
              );
              drawSolid(
                sphere,
                matMul(srcRot, compose([0.05, 0, 0], [0, 0, 0], [0.2, 0.2, 0.2])),
                vp,
                WARM_LIGHT,
                0.5,
                sAlpha,
              );
              drawSolid(
                nozzle,
                matMul(srcRot, compose([0.62, 0, 0], [0, 0, 0], [0.44, 0.34, 0.34])),
                vp,
                GOLD_DEEP,
                0.4,
                sAlpha,
              );
            }
          }
          // Energy strands pulling the sources together during condensation.
          if (stationPhase === "condensation" && src === 0) {
            strandData[0] = sPos[0];
            strandData[1] = sPos[1];
            strandData[2] = sPos[2];
            strandData[3] = 0;
            strandData[4] = sPos[0];
            strandData[5] = sPos[1];
            strandData[6] = sPos[2];
            strandData[7] = 1;
            strandData[8] = base[0];
            strandData[9] = base[1];
            strandData[10] = base[2];
            strandData[11] = 0;
            strandData[12] = base[0];
            strandData[13] = base[1];
            strandData[14] = base[2];
            strandData[15] = 1;
            gl.useProgram(lineP);
            gl.bindBuffer(gl.ARRAY_BUFFER, strandBuf);
            gl.bufferData(gl.ARRAY_BUFFER, strandData, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(laP);
            gl.vertexAttribPointer(laP, 3, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(laT);
            gl.vertexAttribPointer(laT, 1, gl.FLOAT, false, 16, 12);
            gl.uniformMatrix4fv(lu.M, false, matIdentity());
            gl.uniformMatrix4fv(lu.VP, false, vp);
            gl.uniform3f(lu.C, 1, 0.74, 0.2);
            gl.uniform1f(lu.Alpha, 0.5 * fade);
            gl.uniform1f(lu.Energy, 1);
            gl.uniform1f(lu.Time, t);
            gl.drawArrays(gl.LINES, 0, 4);
            gl.useProgram(solidP);
          }
        }
        // Combined assembly: rail spine + ion rings + chamber core + exhaust, gold synthesis.
        model(cube, [0, -0.52, 0], [0, 0, 0], [1.42 * k, 0.045, 0.42 * k], BLUE_GLASS_DEEP, 0.24);
        for (let q = -1; q <= 1; q += 2)
          model(cube, [0, q * 0.36, 0], [0, 0, 0], [1.42 * k, 0.034, 0.034], ICE, 0.34);
        for (let ring = -1; ring <= 1; ring++)
          model(
            torus,
            [ring * 0.48, 0, 0],
            [Math.PI / 2, 0, 0],
            [0.3 * k, 0.3 * k, 0.3 * k],
            GOLD,
            0.42,
          );
        model(nozzle, [0.95, 0, 0], [0, 0, 0], [0.58 * k, 0.42 * k, 0.42 * k], GOLD_DEEP, 0.36);
        model(
          sphere,
          [-0.1, 0, 0],
          [0, 0, 0],
          [0.28 * k, 0.28 * k, 0.28 * k],
          [0.18, 0.72, 0.95],
          0.32,
        );
        return;
      }

      if (kind === "turbofan") {
        model(
          cylinder,
          [0, 0, 0],
          [0, 0, 0],
          [1.05 * k, 0.52 * k, 0.52 * k],
          BLUE_GLASS_DEEP,
          0.18,
        );
        model(
          torus,
          [-0.92, 0, 0],
          [0, Math.PI / 2, 0],
          [0.54 * k, 0.54 * k, 0.54 * k],
          GOLD,
          0.32,
        );
        model(sphere, [-0.86, 0, 0], [0, 0, 0], [0.19 * k, 0.19 * k, 0.19 * k], WARM_LIGHT, 0.28);
        for (let s = -2; s <= 2; s++)
          model(
            torus,
            [s * 0.3, 0, 0],
            [0, Math.PI / 2, 0],
            [0.34 * k, 0.34 * k, 0.34 * k],
            s === 0 ? WARM_LIGHT : GOLD,
            0.26,
          );
        for (let blade = 0; blade < 8; blade++) {
          const a = (blade * Math.PI) / 4;
          model(
            cube,
            [-0.88, Math.cos(a) * 0.25, Math.sin(a) * 0.25],
            [a, 0, 0],
            [0.035 * k, 0.24 * k, 0.055 * k],
            ICE,
            0.2,
          );
        }
        model(nozzle, [0.93, 0, 0], [0, 0, 0], [0.45 * k, 0.44 * k, 0.44 * k], BLUE_GLASS, 0.26);
      } else if (kind === "rocket") {
        model(cylinder, [-0.42, 0, 0], [0, 0, 0], [0.56 * k, 0.34 * k, 0.34 * k], BLUE_GLASS, 0.26);
        model(
          torus,
          [-0.84, 0, 0],
          [0, Math.PI / 2, 0],
          [0.34 * k, 0.34 * k, 0.34 * k],
          GOLD,
          0.28,
        );
        model(sphere, [-0.28, 0, 0], [0, 0, 0], [0.24 * k, 0.24 * k, 0.24 * k], WARM_LIGHT, 0.3);
        model(
          nozzle,
          [0.48, 0, 0],
          [0, 0, 0],
          [0.82 * k, 0.62 * k, 0.62 * k],
          [0.98, 0.45, 0.16],
          0.34,
        );
        model(
          torus,
          [0.9, 0, 0],
          [0, Math.PI / 2, 0],
          [0.58 * k, 0.58 * k, 0.58 * k],
          [1, 0.58, 0.18],
          0.3,
        );
        model(cube, [1.42, 0, 0], [0, 0, 0], [0.52 * k, 0.016, 0.016], [1, 0.68, 0.28], 0.22);
      } else if (kind === "ion") {
        model(
          cylinder,
          [-0.42, 0, 0],
          [0, 0, 0],
          [0.48 * k, 0.42 * k, 0.42 * k],
          BLUE_GLASS_DEEP,
          0.18,
        );
        model(sphere, [-0.48, 0, 0], [0, 0, 0], [0.25 * k, 0.25 * k, 0.25 * k], ICE, 0.26);
        for (let g = 0; g < 4; g++)
          model(
            torus,
            [0.08 + g * 0.2, 0, 0],
            [0, Math.PI / 2, 0],
            [0.4 * k, 0.4 * k, 0.4 * k],
            g % 2 ? GOLD : ICE,
            0.3,
          );
        for (let q = -1; q <= 1; q += 2)
          model(cube, [0.34, q * 0.28, 0], [0, 0, 0], [0.82 * k, 0.018, 0.018], ICE, 0.18);
        model(cube, [1.28, 0, 0], [0, 0, 0], [0.76 * k, 0.012, 0.012], BLUE_GLASS, 0.26);
      } else if (kind === "linear") {
        // Linear propulsion — enriched only when the user's own specs are identified.
        const rails = spec?.rails ?? 2;
        const coils = spec?.coils ?? 3;
        for (let r = 0; r < rails; r++) {
          const off = (r - (rails - 1) / 2) * 0.3;
          model(cube, [0, off, 0], [0, 0, 0], [1.5 * k, 0.035, 0.035], CYAN, 0.32);
        }
        const spacing = coils > 3 ? 0.28 : 0.62;
        for (let cIdx = 0; cIdx < coils; cIdx++) {
          const x = (cIdx - (coils - 1) / 2) * spacing;
          model(torus, [x, 0, 0], [Math.PI / 2, 0, 0], [0.3 * k, 0.3 * k, 0.3 * k], GOLD, 0.34);
        }
        // Higher glow keeps the core readable as glass instead of a black wedge.
        model(cube, [0, 0, 0], [0, 0, 0], [0.54 * k, 0.2 * k, 0.28 * k], BLUE_GLASS, 0.5);
        if (spec?.stasis)
          model(torus, [0, 0, 0], [0, Math.PI / 2, 0], [0.62 * k, 0.62 * k, 0.62 * k], GOLD, 0.44);
        if (spec?.piezo)
          for (let q = -1; q <= 1; q += 2)
            model(cube, [0, q * 0.42, 0], [0, 0, 0], [1.44 * k, 0.012, 0.05], ICE, 0.3);
        if (spec?.lidar)
          model(sphere, [-1.05, 0, 0], [0, 0, 0], [0.12 * k, 0.12 * k, 0.12 * k], WARM_LIGHT, 0.4);
        model(cube, [1.55, 0, 0], [0, 0, 0], [0.62 * k, 0.015, 0.015], BLUE_GLASS, 0.26);
      } else if (kind === "plasma") {
        model(
          cylinder,
          [-0.42, 0, 0],
          [0, 0, 0],
          [0.54 * k, 0.36 * k, 0.36 * k],
          BLUE_GLASS_DEEP,
          0.18,
        );
        model(sphere, [-0.22, 0, 0], [0, 0, 0], [0.3 * k, 0.3 * k, 0.3 * k], WARM_LIGHT, 0.36);
        for (let ring = -1; ring <= 1; ring++)
          model(
            torus,
            [ring * 0.46, 0, 0],
            [0, Math.PI / 2, 0],
            [0.38 * k, 0.38 * k, 0.38 * k],
            ring === 0 ? GOLD : CYAN,
            0.34,
          );
        model(nozzle, [0.78, 0, 0], [0, 0, 0], [0.72 * k, 0.5 * k, 0.5 * k], BLUE_GLASS, 0.28);
      } else if (kind === "fluid") {
        model(cylinder, [-0.34, 0, 0], [0, 0, 0], [0.72 * k, 0.34 * k, 0.34 * k], BLUE_GLASS, 0.22);
        for (let v = -1; v <= 1; v++)
          model(
            torus,
            [v * 0.45, 0, 0],
            [0, Math.PI / 2, 0],
            [0.31 * k, 0.31 * k, 0.31 * k],
            GOLD,
            0.24,
          );
        model(
          nozzle,
          [0.82, 0, 0],
          [0, 0, 0],
          [0.6 * k, 0.46 * k, 0.46 * k],
          BLUE_GLASS_DEEP,
          0.24,
        );
      } else {
        model(cube, [0, 0, 0], [0, 0, 0], [0.72 * k, 0.24 * k, 0.32 * k], color, 0.26);
        model(
          torus,
          [-0.52, 0, 0],
          [Math.PI / 2, 0, 0],
          [0.32 * k, 0.32 * k, 0.32 * k],
          GOLD,
          0.28,
        );
        model(torus, [0.52, 0, 0], [Math.PI / 2, 0, 0], [0.32 * k, 0.32 * k, 0.32 * k], GOLD, 0.28);
      }

      // A generated Hunyuan3D model, once fetched and parsed, becomes the
      // stabilized form. It never replaces the manifestation energy itself.
      const generated = generatedRef.current;
      if (
        focus &&
        generated &&
        generated.id === path.id &&
        stationPhase !== "possibility" &&
        stationPhase !== "condensation"
      ) {
        if (generatedBuiltFor !== generated.mesh || !generatedBuf) {
          if (!generatedBuf) generatedBuf = dynamicBuffer(gl);
          const min: Vec3 = [1e9, 1e9, 1e9],
            max: Vec3 = [-1e9, -1e9, -1e9];
          for (let i = 0; i < generated.mesh.length; i += 3) {
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
          const s = 1.5 / extent;
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
        }
        const alpha =
          (stationPhase === "reveal" ? lerp(0.5, 1, prog) : 1) *
          (focus && stationPhase === "stabilized" ? 1 : focus ? 0.98 : 0.84) *
          fade;
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
          onPhaseChangeRef.current?.(primaryPhase, { blend: Boolean(focusBlend) });
        setPhase(primaryPhase);
      }

      // Cinematic fade: unselected realities recede, the selected one emerges.
      const fadeTargets = [0, 1, 2, 3].map((i) => (!focused || paths[i]?.id === focused ? 1 : 0.1));
      fadeTargets.push(!focused || delivery.blend?.id === focused ? 1 : 0.1);
      for (let i = 0; i < stationFadeRef.current.length; i++) {
        const cur = stationFadeRef.current[i] ?? 1;
        stationFadeRef.current[i] = cur + ((fadeTargets[i] ?? 1) - cur) * Math.min(1, 0.09);
      }

      const particlesFor = (stationIndex: number, pos: Vec3, fade: number) => {
        if (fade <= 0.02) return;
        const focusedHere = Boolean(
          focused && (paths[stationIndex]?.id === focused || delivery.blend?.id === focused),
        );
        const elapsed = Math.max(
          0,
          (focusedHere ? clocks.focus : clocks.overview) -
            (focusedHere ? 0 : stationIndex * STATION_STAGGER_MS),
        );
        const ph = manifestationPhase(elapsed);
        const pr = phaseProgress(elapsed);
        const converge = ph === "possibility" ? 0 : ph === "condensation" ? easeOutCubic(pr) : 1;
        let cyanUsed = 0,
          goldUsed = 0;
        const seed = stationIndex * 0.73 + 1;
        for (let i = 0; i < PARTICLES_PER_STATION; i++) {
          const p = particles[i];
          if (!p) continue;
          let bright: number;
          if (ph === "possibility") bright = 0.85;
          else if (ph === "condensation") bright = lerp(0.85, 0.5, pr);
          else if (ph === "reveal") bright = lerp(0.5, 0.16, pr);
          else bright = i % 6 === 0 ? 0.3 : 0;
          if (bright <= 0) continue;
          const ang =
            p.phase +
            (elapsed / 1000) * p.speed * (1 - 0.75 * converge) * (reducedMotion ? 0.25 : 1);
          const R = (1.8 - 0.95 * converge) * (0.62 + partHash(i + 7, seed) * 0.75);
          const wob = Math.sin(t * p.wobble + p.phase) * 0.12 * (1 - converge);
          const o = (p.gold ? goldUsed : cyanUsed) * 5;
          const target = p.gold ? goldData : cyanData;
          target[o] = pos[0] + p.dir[0] * R;
          target[o + 1] = pos[1] + p.dir[1] * R + wob;
          target[o + 2] = pos[2] + p.dir[2] * R;
          target[o + 3] = p.size;
          target[o + 4] = bright;
          if (p.gold) goldUsed++;
          else cyanUsed++;
        }
        drawParticles(
          cyanBuf,
          cyanData,
          cyanUsed,
          vp,
          [0.6, 0.88, 1],
          0.5 * fade,
          dpr * (focusedHere ? 1.2 : 1),
        );
        drawParticles(
          goldBuf,
          goldData,
          goldUsed,
          vp,
          [1, 0.78, 0.32],
          0.55 * fade,
          dpr * (focusedHere ? 1.2 : 1),
        );
      };

      if (focused) {
        if (focusPath && focusIndex >= 0) {
          const slot = PATH_SLOTS[focusIndex]?.pos ?? [0, 0, 0];
          renderAssembly(vp, focusPath, slot, hue(focusIndex), true, t, focusIndex, clocks, false);
          particlesFor(
            focusIndex,
            [
              lerp(slot[0], FOCUS_BASE[0], easeOutCubic(Math.min(1, clocks.focus / 450))),
              FOCUS_BASE[1],
              0,
            ],
            stationFadeRef.current[focusIndex] ?? 1,
          );
        } else if (delivery.blend && focusBlend) {
          renderAssembly(vp, delivery.blend, BLEND_POS, [1, 0.66, 0.18], true, t, 4, clocks, true);
          particlesFor(4, BLEND_POS, stationFadeRef.current[4] ?? 1);
        }
      } else {
        paths.forEach((path, i) => {
          const pos = PATH_SLOTS[i]?.pos ?? [0, 0, 0];
          renderAssembly(vp, path, pos, hue(i), false, t, i, clocks, false);
          particlesFor(i, pos, stationFadeRef.current[i] ?? 1);
        });
        if (delivery.blend) {
          renderAssembly(vp, delivery.blend, BLEND_POS, [1, 0.66, 0.18], false, t, 4, clocks, true);
          particlesFor(4, BLEND_POS, stationFadeRef.current[4] ?? 1);
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      [cube, torus, sphere, cylinder, nozzle].forEach((m) => gl.deleteBuffer(m.buffer));
      [helixM, arcM, orbitM].forEach((m) => gl.deleteBuffer(m.buffer));
      [cyanBuf, goldBuf, strandBuf].forEach((b) => gl.deleteBuffer(b));
      if (generatedBuf) gl.deleteBuffer(generatedBuf);
      [solidP, lineP, pointP].forEach((p) => gl.deleteProgram(p));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneSignature]);

  const pointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!selectedId) return;
    dragRef.current = { x: e.clientX, y: e.clientY, active: true, moved: false };
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

  const phaseLabel = MANIFESTATION_PHASE_LABEL[phase];

  return (
    <div
      className="ascension-envision-3d"
      data-focused={selectedId ? "true" : "false"}
      data-phase={phase}
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
        <span>ENVISION MODE</span>
        <strong data-phase={phase}>
          {selected
            ? phase === "stabilized"
              ? "HOLOGRAPHIC REALITY · DRAG TO ROTATE · SCROLL TO ZOOM"
              : phaseLabel
            : phaseLabel}
        </strong>
        {selected && !isBlend && selectedSpec?.label && (
          <em className="ascension-holo-spec">{selectedSpec.label}</em>
        )}
      </div>
      {!selected &&
        paths.map((path, i) => (
          <button
            key={path.id}
            className="ascension-holo-hit"
            style={{ left: PATH_SLOTS[i]?.left, top: PATH_SLOTS[i]?.labelTop }}
            onClick={() => onSelect(path.id)}
          >
            <span>PATH {String(i + 1).padStart(2, "0")}</span>
            <strong>{path.label}</strong>
            {path.outcome_score !== null && <em>{Math.round(path.outcome_score * 100)}%</em>}
          </button>
        ))}
      {!selected && delivery.blend && (
        <button
          className="ascension-holo-hit ascension-holo-hit--blend"
          style={{ left: "50%", top: "61%" }}
          onClick={() => onSelect(delivery.blend!.id)}
        >
          <span>BLEND REALITIES</span>
          <strong>SPIRAL + OUTCOME</strong>
          {delivery.blend.outcome_score !== null && (
            <em>{Math.round(delivery.blend.outcome_score * 100)}%</em>
          )}
        </button>
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
          <div>
            <p>
              {isBlend
                ? "BLEND REALITY"
                : generated && generated.id === selected.id
                  ? "HUNYUAN3D REALITY · GENERATED MODEL"
                  : "ENVISIONED REALITY"}
            </p>
            <h3>{selected.label}</h3>
            <span>{selected.summary}</span>
          </div>
          <div className="ascension-holo-actions">
            <button
              onClick={() => {
                rotationRef.current = { x: -0.18, y: 0.45 };
                zoomRef.current = 1;
              }}
            >
              RESET VIEW
            </button>
            <button onClick={() => onSelect(null)}>BACK</button>
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
            <button onClick={() => onUse(selected)}>
              {isBlend ? "OPEN BLEND" : "OPEN REALITY"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
