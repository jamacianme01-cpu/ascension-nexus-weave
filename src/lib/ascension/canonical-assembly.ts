import * as THREE from "three";
import type { ObjectivePathway, ObjectiveModelPart } from "./result-model";
import type { DesignPart } from "./parts-model";
import { linearSpecFromText } from "./manifestation";

type Vec3 = [number, number, number];
function norm(v: Vec3): Vec3 { const d = Math.hypot(...v) || 1; return [v[0]/d,v[1]/d,v[2]/d]; }
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
export function pathwayKind(path: ObjectivePathway, objective = "") {
  const text = `${objective} ${path.label} ${path.summary}`.toLowerCase();
  if (/turbofan|turbine|jet engine|compressor|bypass/.test(text)) return "turbofan";
  if (/rocket|combustion chamber/.test(text)) return "rocket";
  if (/ion thruster|ion propulsion/.test(text)) return "ion";
  if (/linear (?:propulsion|engine|motor)|railgun|maglev|electromagnetic (?:rail|acceleration|propulsion)/.test(text)) return "linear";
  if (/plasma (?:engine|thruster|propulsion)/.test(text)) return "plasma";
  if (/(?:hydraulic|pneumatic) (?:engine|pump|motor)|fluid propulsion/.test(text)) return "fluid";
  return "generic";
}
export type AssemblyPart = { vertices: Float32Array; position: Vec3; rotation: Vec3; scale: Vec3; color: Vec3; detail: DesignPart };
const GOLD: Vec3 = [1,.8,.38], GOLD_DEEP: Vec3 = [.86,.6,.24], BLUE_GLASS: Vec3 = [.34,.58,.98], BLUE_GLASS_DEEP: Vec3 = [.18,.36,.72], ICE: Vec3 = [.62,.88,1], CYAN: Vec3 = [.28,.84,.95], WARM_LIGHT: Vec3 = [1,.92,.7];
const palette: Record<ObjectiveModelPart["material"], Vec3> = {gold:GOLD,gold_deep:GOLD_DEEP,blue:BLUE_GLASS,blue_deep:BLUE_GLASS_DEEP,ice:ICE,cyan:CYAN,warm:WARM_LIGHT,copper:[.88,.34,.1],steel:[.14,.2,.27],dark:[.035,.055,.075]};
const cube = cubeVertices(), torus = torusVertices(), sphere = sphereVertices(), cylinder = cylinderVertices(), nozzle = cylinderVertices(30,true);
const geometry = {box:cube,ring:torus,sphere,cylinder,nozzle};
/** Canonical f96e3a0 assemblies, shared by the hologram and editable workbench. Never physical verification. */
export function canonicalAssembly(objective: string, path: ObjectivePathway): AssemblyPart[] {
 const result: AssemblyPart[] = [];
 const detail = (name: string, position: Vec3): DesignPart => ({name,x:.5,y:.5,purpose:path.summary || objective,location:`Interpretive position ${position.join(", ")} (not measured)`,operation:path.model_spec?.description || path.steps.join(" · "),connections:"Conceptual arrangement only; physical connections are unavailable.",limitations:[...path.tradeoffs,"CONCEPT / UNVERIFIED. Physical feasibility and measured construction are unavailable."].join(" · ")});
 const model = (vertices: Float32Array, position: Vec3, rotation: Vec3, scale: Vec3, color: Vec3, _g=0, _a=1, name?: string) => {
  const semantic = name ?? (vertices===torus ? (color[0]===.88 ? "Copper winding" : "Ring housing") : vertices===cylinder ? "Axial core" : vertices===nozzle ? "Exhaust nozzle" : vertices===sphere ? "Chamber core" : "Support structure");
  const label = name ?? `${semantic} ${result.filter(p=>p.detail.name.startsWith(semantic)).length+1}`;
  result.push({vertices,position,rotation,scale,color,detail:detail(label,position)});
 };
 if (path.model_spec) {
  for (const p of path.model_spec.parts) model(geometry[p.primitive],p.position,p.rotation,p.scale,palette[p.material],0,1,p.name);
  return result;
 }
 const kind=pathwayKind(path,objective), spec=linearSpecFromText(objective,path.label,path.summary,path.spiral_form), k=1;
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
          model(
            cylinder,
            [-0.42, 0, 0],
            [0, 0, 0],
            [0.56 * k, 0.34 * k, 0.34 * k],
            BLUE_GLASS,
            0.26,
          );
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
          // APPROVED REFERENCE MODEL:
          // three gilded circular housings + visible copper winding packs +
          // long blue support rails + dark structural spine + physical base.
          // CUTAWAY, BLUEPRINT and ENVIRONMENT all render THIS SAME geometry.
          const copper: Vec3 = [0.88, 0.34, 0.1];
          const railBlue: Vec3 = [0.025, 0.3, 0.62];
          const steel: Vec3 = [0.1, 0.14, 0.19];
          const darkSteel: Vec3 = [0.035, 0.055, 0.075];

          // Exhibition base from the approved cutaway reference.
          model(cube, [0, -0.72, 0.06], [0, 0, 0], [0.92 * k, 0.085, 0.58 * k], darkSteel, 0.08, 1);
          model(
            cube,
            [0, -0.61, 0.02],
            [0, 0, 0],
            [0.78 * k, 0.035, 0.46 * k],
            railBlue,
            0.12,
            0.98,
          );

          // Dark central load-bearing spine running through the entire machine.
          model(cylinder, [0, 0, 0], [0, 0, 0], [1.35 * k, 0.11 * k, 0.11 * k], steel, 0.08, 1);

          // Long support rails. Use the user's identified rail count when known;
          // otherwise the four-beam exhibit arrangement from the approved image.
          const railCount = spec?.rails ?? 4;
          const railSlots: Vec3[] =
            railCount === 3
              ? [
                  [0, 0.34, 0],
                  [0, -0.28, 0.24],
                  [0, -0.28, -0.24],
                ]
              : [
                  [0, 0.34, 0.22],
                  [0, 0.34, -0.22],
                  [0, -0.34, 0.22],
                  [0, -0.34, -0.22],
                ];
          for (const [, y, z] of railSlots) {
            model(cube, [0, y, z], [0, 0, 0], [1.58 * k, 0.055, 0.055], railBlue, 0.14, 1);
            // Gold end caps echo the approved exhibit model.
            for (let q = -1; q <= 1; q += 2)
              model(
                cube,
                [q * 1.54 * k, y, z],
                [0, 0, 0],
                [0.06, 0.072, 0.072],
                GOLD_DEEP,
                0.12,
                1,
              );
          }

          // Three large ring housings arranged along the propulsion axis.
          const housingX = [-0.78, 0, 0.78];
          for (let h = 0; h < housingX.length; h++) {
            const x = housingX[h] ?? 0;
            model(
              torus,
              [x, 0, 0],
              [0, Math.PI / 2, 0],
              [0.5 * k, 0.5 * k, 0.5 * k],
              h === 1 ? [0.66, 0.56, 0.38] : GOLD,
              0.18,
              1,
            );
            // Inner structural ring visible through the cutaway.
            model(
              torus,
              [x, 0, 0],
              [0, Math.PI / 2, 0],
              [0.38 * k, 0.38 * k, 0.38 * k],
              steel,
              0.08,
              1,
            );

            // Copper winding pack inside each housing: a stack of tightly spaced
            // turns around the X-axis, not a single flat symbolic ring.
            const turns = spec?.coils && spec.coils >= 9 ? 9 : 7;
            for (let turn = 0; turn < turns; turn++) {
              const tx = x + (turn - (turns - 1) / 2) * 0.032 * k;
              model(
                torus,
                [tx, 0, 0],
                [0, Math.PI / 2, 0],
                [0.235 * k, 0.235 * k, 0.235 * k],
                copper,
                0.16,
                1,
              );
            }

            // Central core visible inside the copper pack.
            model(
              cylinder,
              [x, 0, 0],
              [0, 0, 0],
              [0.22 * k, 0.105 * k, 0.105 * k],
              darkSteel,
              0.06,
              1,
            );
          }

          // Horizontal braces linking the three housings.
          for (let q = -1; q <= 1; q += 2) {
            model(
              cube,
              [0, q * 0.48, 0],
              [0, 0, 0],
              [1.02 * k, 0.035, 0.075],
              [0.18, 0.22, 0.26],
              0.08,
              1,
            );
          }

          // Optional user-specific components are additive; they do not alter the
          // approved base model for unrelated objectives.
          if (spec?.stasis) {
            model(
              torus,
              [0, 0, 0],
              [0, Math.PI / 2, 0],
              [0.61 * k, 0.61 * k, 0.61 * k],
              [0.3, 0.72, 0.92],
              0.16,
              0.72,
            );
          }
          if (spec?.piezo) {
            for (let q = -1; q <= 1; q += 2)
              model(cube, [0, q * 0.43, -0.28], [0, 0, 0], [1.42 * k, 0.018, 0.035], ICE, 0.1, 0.9);
          }
          if (spec?.lidar) {
            model(
              sphere,
              [-1.2 * k, 0.56, 0],
              [0, 0, 0],
              [0.1 * k, 0.1 * k, 0.1 * k],
              WARM_LIGHT,
              0.16,
              1,
            );
          }
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
          model(
            cylinder,
            [-0.34, 0, 0],
            [0, 0, 0],
            [0.72 * k, 0.34 * k, 0.34 * k],
            BLUE_GLASS,
            0.22,
          );
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
        }

 if (!result.length) {
  // Unknown subjects get explicit semantic diagram points, never an invented engine or room.
  const entries = path.steps.length ? path.steps : [path.label,path.summary];
  entries.filter(Boolean).slice(0,12).forEach((name,i)=>model(sphere,[0,(entries.length-1)*.35-i*.7,0],[0,0,0],[.12,.12,.12],CYAN,0,1,name));
 }
 return result;
}
export function assemblyParts(objective: string, path: ObjectivePathway): DesignPart[] { return canonicalAssembly(objective,path).map(p=>p.detail); }
export function buildCanonicalAssembly(objective: string, path: ObjectivePathway): THREE.Group {
 const group=new THREE.Group(); group.name=path.model_spec?.title ?? path.label;
 for(const part of canonicalAssembly(objective,path)) {
  const positions: number[]=[], normals: number[]=[];
  for(let i=0;i<part.vertices.length;i+=6) { positions.push(...part.vertices.slice(i,i+3)); normals.push(...part.vertices.slice(i+3,i+6)); }
  const geometry=new THREE.BufferGeometry(); geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3)); geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:new THREE.Color(...part.color),roughness:.38,metalness:.28}));
  mesh.position.set(...part.position); mesh.rotation.set(...part.rotation); mesh.scale.set(...part.scale); mesh.name=part.detail.name; mesh.userData["conceptPart"]=part.detail; group.add(mesh);
 }
 return group;
}
export function explodeAssembly(group: THREE.Group, enabled: boolean, saved: Map<THREE.Object3D,THREE.Vector3>) {
 for(const [i,node] of group.children.entries()) {
  if(enabled && !saved.has(node)) {saved.set(node,node.position.clone()); node.position.multiplyScalar(1.55); node.position.y += (i-(group.children.length-1)/2)*.12;}
  else if(!enabled) { const p=saved.get(node); if(p)node.position.copy(p); saved.delete(node); }
 }
 group.updateWorldMatrix(true,true);
}
