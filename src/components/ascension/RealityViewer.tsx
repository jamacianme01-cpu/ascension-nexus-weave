import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { splitMeshIslands, attachComponent, isAncestor } from "@/lib/ascension/component-workbench";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { Button } from "@/components/ui/button";
import type { ObjectivePathway } from "@/lib/ascension/result-model";
import { getDesignParts, getDissectedDesign } from "@/lib/ascension/parts.functions";
import type { DesignPart } from "@/lib/ascension/parts-model";
import { buildCanonicalAssembly, assemblyParts, explodeAssembly, pathwayKind } from "@/lib/ascension/canonical-assembly";
import "./reality-viewer.css";
import { RealityDissection } from './RealityDissection';
import { demonstrationPhases, demonstrationFrame, DEMONSTRATION_SECONDS, groundedComponent } from './reality-demonstration';
import { realityFeedback, setRealityVolume } from './reality-audio';

export type RealityMode = "cutaway" | "blueprint" | "environment";
type View = "perspective" | "top" | "front" | "side";
type RoomName = "Workspace" | "Living Area" | "Bathroom" | "Bedroom" | "Kitchen" | "Garage";
type CatalogKind =
  | "box"
  | "sphere"
  | "cylinder"
  | "panel"
  | "beam"
  | "column"
  | "desk"
  | "chair"
  | "sofa"
  | "table"
  | "cabinet"
  | "wall"
  | "door"
  | "window"
  | "tub"
  | "sink"
  | "light"
  | "wheel"
  | "gear"
  | "pipe"
  | "coil"
  | "motor"
  | "battery"
  | "prism"
  | "rail"
  | "sensor";
const ROOM_OPTIONS: readonly RoomName[] = [
  "Workspace",
  "Living Area",
  "Bathroom",
  "Bedroom",
  "Kitchen",
  "Garage",
];
type ViewerControls = {
  mode: (mode: RealityMode) => void;
  fit: () => void;
  zoom: (factor: number) => void;
  view: (view: View) => void;
  section: (value: number) => void;
  explore: (enabled: boolean) => void;
  move: (direction: string, down: boolean) => void;
  transform: (mode: "translate" | "rotate" | "scale") => void;
  add: (kind: CatalogKind) => void;
  remove: () => void;
  color: (value: string) => void;
  background: (value: string) => void;
  space: (value: string) => void;
  reset: () => void;
  picture: () => string;
  anchorParts: (parts: DesignPart[]) => DesignPart[];
  locatePart: (index:number) => void;
  selectComponent: (id: string) => void;
  combine: (source: string, target: string, blend: boolean) => void;
  undo: () => void;
  exportAssembly: () => Promise<void>;
  explode: (enabled: boolean) => void;
};

/** Dedicated GLB workbench with an explicitly unverified, data-derived concept diagram. */
export function RealityViewer({
  pathway,
  objective,
  initialMode,
  onClose,
  onNewObjective,
  newObjectiveDisabled,
  soundEnabled,
  onToggleSound,
  onDive,
  onBuildOn,
  onNewAnswers,
  isPartSelected,
  onTogglePart,
  blendControls,
}: {
  pathway: ObjectivePathway;
  objective: string;
  initialMode: RealityMode;
  onClose: () => void;
  onNewObjective: () => void;
  newObjectiveDisabled: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onDive: () => void;
  onBuildOn: () => void;
  onNewAnswers: () => void;
  isPartSelected: (part: DesignPart, field?: "purpose" | "location" | "operation" | "connections" | "limitations") => boolean;
  onTogglePart: (part: DesignPart, field?: "purpose" | "location" | "operation" | "connections" | "limitations") => void;
  blendControls: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ViewerControls | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [components, setComponents] = useState<Array<{id:string;name:string;detail:DesignPart|null}>>([]);
  const [componentId, setComponentId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");
  const [workbenchError, setWorkbenchError] = useState<string | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [ready, setReady] = useState(false);
  const edited = useRef(false);
  const [loadedUrl, setLoadedUrl] = useState(pathway.model_url);
  const conceptual = !loadedUrl;
  const conceptParts = assemblyParts(objective, pathway);
  const conceptPartsRef = useRef(conceptParts);
  conceptPartsRef.current = conceptParts;
  useEffect(() => { edited.current = false; setLoadedUrl(pathway.model_url); }, [pathway.id]);
  useEffect(() => { if (!edited.current && pathway.model_url) setLoadedUrl(pathway.model_url); }, [pathway.model_url]);
  const labelsHost = useRef<HTMLDivElement>(null);
  const [dissected, setDissected] = useState(false);
  const [dissection, setDissection] = useState<{imageUrl: string; parts: DesignPart[]} | null>(null);
  const [dissectionLoading, setDissectionLoading] = useState(false);
  const [dissectionError, setDissectionError] = useState<string | null>(null);
  const [dissectionAttempt, setDissectionAttempt] = useState(0);
  useEffect(() => { setDissection(null); setDissected(false); setDissectionError(null); }, [pathway.id, loadedUrl]);
  useEffect(() => {
    // DISSECTED creates a separate produced illustration for both provisional
    // assemblies and completed Hunyuan meshes, only when requested.
    if (!dissected || !ready || !api.current || dissection) return;
    let active = true;
    setDissectionLoading(true); setDissectionError(null); setPartIndex(null);
    getDissectedDesign({data:{objective,label:pathway.label,summary:pathway.summary,image:api.current.picture()}})
      .then(result => { if(active) setDissection(result); })
      .catch(cause => { if(active) setDissectionError(cause instanceof Error ? cause.message : "Dissected view could not be generated."); })
      .finally(()=>{if(active)setDissectionLoading(false);});
    return ()=>{active=false;};
  }, [dissected, ready, pathway.id, pathway.label, pathway.summary, objective, dissectionAttempt]);
  const [showParts, setShowParts] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [simulate, setSimulate] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const phases = demonstrationPhases(pathway, conceptParts);
  const frame = demonstrationFrame(seconds, phases.length);
  const interpretiveDemo = conceptual && !pathway.model_spec && pathwayKind(pathway, objective) === 'generic';
  const demoRef = useRef({ active: false, names: [] as string[], progress: 0, reduced: false });
  demoRef.current = { active: simulate && !dissected, names: phases[frame.index]?.partNames ?? [], progress: frame.progress, reduced: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches };
  useEffect(() => { setSimulate(false);setPlaying(false);setSeconds(0); }, [pathway.id]);
  useEffect(() => {
    if (!simulate || !playing) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {const now=performance.now();const delta=(now-previous)/1000;previous=now;setSeconds(value=>{const next=Math.min(DEMONSTRATION_SECONDS,value+delta);if(next===DEMONSTRATION_SECONDS)setPlaying(false);return next;});},50);
    return () => window.clearInterval(timer);
  }, [simulate, playing]);
  useEffect(() => { if (simulate && playing && soundEnabled) realityFeedback(frame.index); }, [frame.index, simulate, playing, soundEnabled]);
  useEffect(() => {setRealityVolume(soundEnabled ? volume : 0);}, [volume, soundEnabled]);
  const [parts, setParts] = useState<DesignPart[]>([]);
  const [partIndex, setPartIndex] = useState<number | null>(null);
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsError, setPartsError] = useState<string | null>(null);
  const [partsAttempt, setPartsAttempt] = useState(0);
  useEffect(() => {
    setParts([]);
    setPartIndex(null);
    setPartsError(null);
  }, [pathway.id, pathway.summary]);
  const partsStepsKey = JSON.stringify(pathway.steps);
  useEffect(() => {
    if (!showParts || !ready || !api.current || conceptual) return;
    let active = true;
    setPartsLoading(true);
    setPartsError(null);
    getDesignParts({ data: { objective, label: pathway.label, summary: pathway.summary, steps: JSON.parse(partsStepsKey) as string[], image: api.current.picture() } })
      .then(result => { if (active) { const anchored = api.current?.anchorParts(result) ?? []; if (!anchored.length) throw new Error("No visible parts could be labeled in this view. Rotate the model and retry."); setParts(anchored); setPartIndex(null); } })
      .catch(cause => { if (active) setPartsError(cause instanceof Error ? cause.message : "Part labels could not be loaded."); })
      .finally(() => { if (active) setPartsLoading(false); });
    return () => { active = false; };
  }, [showParts, objective, pathway.id, pathway.label, pathway.summary, partsStepsKey, partsAttempt, ready]);
  const activeParts = dissected && dissection ? dissection.parts : conceptual ? conceptParts : parts;
  // Keep the object assembled while the separate illustrated breakdown is made.
  // The produced image is the dissected view, not the old pulled-apart mesh.
  useEffect(() => { if (conceptual && ready) api.current?.explode(false); }, [conceptual, ready, dissected]);
  const selectedComponent = components.find(component=>component.id===componentId);
  const selectedPart = partIndex !== null ? activeParts[partIndex] : !dissected || conceptual ? selectedComponent?.detail ?? null : null;
  const editIllustratedPart = () => {
    if (!selectedPart) return;
    const matching = groundedComponent(selectedPart.name, components);
    setDissected(false);
    setShowParts(true);
    setEditorOpen(true);
    setPartIndex(null);
    if (matching) api.current?.selectComponent(matching.id);
    else { setComponentId(null);setWorkbenchError("Picture-to-mesh mapping unavailable. Select a 3D component manually below. Illustration pixels are not editable mesh geometry."); }
  };
  const dive = useRef(onDive);
  dive.current = onDive;
  const [mode, setMode] = useState<RealityMode>(
    "cutaway",
  );
  const [selectedObject, setSelectedObject] = useState("Nothing selected");
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
  const [addKind, setAddKind] = useState<CatalogKind>("box");
  const [objectColor, setObjectColor] = useState("#6ed7ff");
  const [backgroundColor, setBackgroundColor] = useState("daylight");
  const [space, setSpace] = useState<RoomName>("Workspace");
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState(100);
  const [exploring, setExploring] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    setArrived(false);
    setMode(initialMode);
    setSelectedObject("Nothing selected");
    setTransformMode("translate");
    setObjectColor("#6ed7ff");
    setBackgroundColor("daylight");
    setSpace("Workspace");
    setSection(100);
    setExploring(false);
    setError(null);
  }, [pathway.id, initialMode]);

  useEffect(() => {
    if (!ready) return;
    dive.current();
    const timer = window.setTimeout(
      () => setArrived(true),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 100 : 1800,
    );
    return () => window.clearTimeout(timer);
  }, [ready, pathway.id, initialMode]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const target = host.current;
    if (!target) return;
    let disposed = false;
    let model: THREE.Group | null = null;
    let renderer: THREE.WebGLRenderer;
    setReady(false);
    setError(null);
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError("3D acceleration is unavailable in this browser.");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute(
      "aria-label",
      "Reality model: drag to rotate, scroll to zoom",
    );
    target.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const perspective = new THREE.PerspectiveCamera(45, 1, 0.01, 300);
    const orthographic = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.01, 300);
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective;
    let orbit: OrbitControls<THREE.PerspectiveCamera | THREE.OrthographicCamera> =
      new OrbitControls(camera, renderer.domElement);
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.85);
    transform.setMode("translate");
    transform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !(event.value as boolean);
    });
    scene.add(transform.getHelper());
    const setSelected = (object: THREE.Object3D | null) => {
      selected = object;
      setComponentId(object?.uuid ?? null);
      transform.detach();
      if (selectedHelper) {
        scene.remove(selectedHelper);
        selectedHelper = null;
      }
      if (!object) {
        setSelectedObject("Nothing selected");
        return;
      }
      transform.attach(object);
      selectedHelper = new THREE.BoxHelper(object, 0x8feaff);
      scene.add(selectedHelper);
      setSelectedObject(
        String(object.userData["ascensionName"] ?? object.name ?? "Object"),
      );
    };
    const applyObjectColor = (value: string) => {
      if (!selected) return;
      selected.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const source = Array.isArray(node.material) ? node.material : [node.material];
        const next = source.map((material) => {
          const clone = material.clone();
          if ("color" in clone && clone.color instanceof THREE.Color) clone.color.set(value);
          return clone;
        });
        node.material = Array.isArray(node.material) ? next : next[0];
        materials.set(node, node.material);
        const blue = next.map((material) => {
          const clone = material.clone();
          if ("color" in clone && clone.color instanceof THREE.Color) clone.color.set("#6bbbd7");
          if ("roughness" in clone) clone.roughness = 0.4;
          if ("metalness" in clone) clone.metalness = 0.18;
          return clone;
        });
        blueprintMaterials.set(
          node,
          Array.isArray(node.material) ? blue : blue[0],
        );
      });
      edited.current = true;
      setObjectColor(value);
    };
    const addObject = (kind: CatalogKind) => {
      edited.current = true;
      const group = new THREE.Group();
      const finish = new THREE.MeshStandardMaterial({
        color: objectColor,
        roughness: 0.38,
        metalness: 0.16,
      });
      const accent = new THREE.MeshStandardMaterial({
        color: 0x9dddeb,
        roughness: 0.28,
        metalness: 0.28,
      });
      const part = (
        geometry: THREE.BufferGeometry,
        position: THREE.Vector3,
        material = finish,
      ) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      };
      if (kind === "sphere") part(new THREE.SphereGeometry(0.65, 32, 20), new THREE.Vector3());
      else if (kind === "cylinder")
        part(
          new THREE.CylinderGeometry(0.55, 0.55, 1.1, 32),
          new THREE.Vector3(),
        );
      else if (kind === "box")
        part(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.Vector3());
      else if (kind === "panel")
        part(new THREE.BoxGeometry(3.2, 0.16, 2.2), new THREE.Vector3());
      else if (kind === "beam")
        part(new THREE.BoxGeometry(5.5, 0.35, 0.35), new THREE.Vector3());
      else if (kind === "column")
        part(
          new THREE.CylinderGeometry(0.42, 0.48, 4.2, 24),
          new THREE.Vector3(0, 2.1, 0),
        );
      else if (kind === "wheel")
        part(
          new THREE.TorusGeometry(0.85, 0.2, 18, 36),
          new THREE.Vector3(),
          accent,
        );
      else if (kind === "gear") {
        part(
          new THREE.CylinderGeometry(0.82, 0.82, 0.24, 16),
          new THREE.Vector3(),
          accent,
        );
        for (let tooth = 0; tooth < 8; tooth++) {
          const a = (tooth * Math.PI) / 4;
          part(
            new THREE.BoxGeometry(0.34, 0.28, 0.22),
            new THREE.Vector3(Math.cos(a) * 0.94, 0, Math.sin(a) * 0.94),
            finish,
          ).rotation.y = -a;
        }
      } else if (kind === "pipe") {
        const pipe = part(
          new THREE.CylinderGeometry(0.18, 0.18, 3.2, 24),
          new THREE.Vector3(),
          accent,
        );
        pipe.rotation.z = Math.PI / 2;
      } else if (kind === "coil") {
        part(
          new THREE.TorusGeometry(0.68, 0.12, 16, 36),
          new THREE.Vector3(),
          accent,
        );
        part(
          new THREE.TorusGeometry(0.68, 0.12, 16, 36),
          new THREE.Vector3(0, 0.34, 0),
          accent,
        );
        part(
          new THREE.TorusGeometry(0.68, 0.12, 16, 36),
          new THREE.Vector3(0, -0.34, 0),
          accent,
        );
      } else if (kind === "motor") {
        const body = part(
          new THREE.CylinderGeometry(0.62, 0.62, 1.8, 32),
          new THREE.Vector3(),
          accent,
        );
        body.rotation.z = Math.PI / 2;
        const shaft = part(
          new THREE.CylinderGeometry(0.16, 0.16, 2.5, 20),
          new THREE.Vector3(),
          finish,
        );
        shaft.rotation.z = Math.PI / 2;
      } else if (kind === "battery") {
        part(
          new THREE.BoxGeometry(1.5, 2.2, 1.1),
          new THREE.Vector3(0, 1.1, 0),
        );
        part(
          new THREE.CylinderGeometry(0.14, 0.14, 0.2, 16),
          new THREE.Vector3(-0.35, 2.3, 0),
          accent,
        );
        part(
          new THREE.CylinderGeometry(0.14, 0.14, 0.2, 16),
          new THREE.Vector3(0.35, 2.3, 0),
          accent,
        );
      } else if (kind === "prism") {
        const prism = part(
          new THREE.CylinderGeometry(0.72, 0.72, 1.8, 10),
          new THREE.Vector3(0, 0.9, 0),
          accent,
        );
        prism.rotation.y = Math.PI / 10;
      } else if (kind === "rail") {
        part(
          new THREE.BoxGeometry(6, 0.18, 0.22),
          new THREE.Vector3(0, 0.2, -0.65),
        );
        part(
          new THREE.BoxGeometry(6, 0.18, 0.22),
          new THREE.Vector3(0, 0.2, 0.65),
          accent,
        );
        for (let i = -2; i <= 2; i++)
          part(
            new THREE.BoxGeometry(0.18, 0.2, 1.6),
            new THREE.Vector3(i, 0.2, 0),
            finish,
          );
      } else if (kind === "sensor") {
        part(
          new THREE.CylinderGeometry(0.3, 0.42, 0.7, 24),
          new THREE.Vector3(0, 0.35, 0),
          accent,
        );
        part(
          new THREE.SphereGeometry(0.5, 24, 16),
          new THREE.Vector3(0, 1.05, 0),
          new THREE.MeshStandardMaterial({
            color: 0x9ae8ff,
            emissive: 0x2d9fbd,
            emissiveIntensity: 0.9,
          }),
        );
      } else if (kind === "desk") {
        part(
          new THREE.BoxGeometry(4.5, 0.28, 2),
          new THREE.Vector3(0, 1.45, 0),
        );
        [-1.9, 1.9].forEach((x) =>
          [-0.7, 0.7].forEach((z) =>
            part(
              new THREE.BoxGeometry(0.22, 1.45, 0.22),
              new THREE.Vector3(x, 0.7, z),
            ),
          ),
        );
        part(
          new THREE.BoxGeometry(1.7, 1.05, 0.12),
          new THREE.Vector3(0, 2.08, -0.55),
          accent,
        );
      } else if (kind === "chair") {
        part(
          new THREE.BoxGeometry(1.6, 0.22, 1.5),
          new THREE.Vector3(0, 0.85, 0),
        );
        part(
          new THREE.BoxGeometry(1.6, 1.8, 0.2),
          new THREE.Vector3(0, 1.7, -0.62),
          accent,
        );
        [-0.55, 0.55].forEach((x) =>
          [-0.5, 0.5].forEach((z) =>
            part(
              new THREE.BoxGeometry(0.14, 0.85, 0.14),
              new THREE.Vector3(x, 0.4, z),
            ),
          ),
        );
      } else if (kind === "sofa") {
        part(
          new THREE.BoxGeometry(4.5, 1.1, 1.8),
          new THREE.Vector3(0, 0.65, 0),
        );
        part(
          new THREE.BoxGeometry(4.5, 1.45, 0.28),
          new THREE.Vector3(0, 1.65, -0.75),
          accent,
        );
        [-2.1, 2.1].forEach((x) =>
          part(
            new THREE.BoxGeometry(0.3, 1.4, 1.8),
            new THREE.Vector3(x, 1.1, 0),
            accent,
          ),
        );
      } else if (kind === "table") {
        part(
          new THREE.CylinderGeometry(1.5, 1.5, 0.22, 40),
          new THREE.Vector3(0, 1.35, 0),
        );
        part(
          new THREE.CylinderGeometry(0.18, 0.28, 1.35, 24),
          new THREE.Vector3(0, 0.65, 0),
          accent,
        );
      } else if (kind === "cabinet") {
        part(
          new THREE.BoxGeometry(2.8, 3.2, 0.55),
          new THREE.Vector3(0, 1.6, 0),
        );
        [-0.68, 0.68].forEach((x) =>
          part(
            new THREE.BoxGeometry(1.28, 2.8, 0.08),
            new THREE.Vector3(x, 1.6, -0.32),
            accent,
          ),
        );
      } else if (kind === "wall") {
        part(new THREE.BoxGeometry(6, 4, 0.22), new THREE.Vector3(0, 2, 0));
      } else if (kind === "door") {
        part(
          new THREE.BoxGeometry(2.2, 4.6, 0.18),
          new THREE.Vector3(0, 2.3, 0),
        );
        part(
          new THREE.SphereGeometry(0.12, 18, 12),
          new THREE.Vector3(0.72, 2.2, -0.18),
          accent,
        );
      } else if (kind === "window") {
        part(
          new THREE.BoxGeometry(4.2, 2.6, 0.12),
          new THREE.Vector3(0, 2.2, 0),
          accent,
        );
        part(
          new THREE.BoxGeometry(3.8, 2.2, 0.08),
          new THREE.Vector3(0, 2.2, -0.1),
          new THREE.MeshStandardMaterial({
            color: 0x8dddf4,
            emissive: 0x1c7087,
            emissiveIntensity: 0.35,
            roughness: 0.18,
            metalness: 0.35,
          }),
        );
        part(
          new THREE.BoxGeometry(0.12, 2.4, 0.16),
          new THREE.Vector3(0, 2.2, -0.18),
          finish,
        );
        part(
          new THREE.BoxGeometry(4, 0.12, 0.16),
          new THREE.Vector3(0, 2.2, -0.18),
          finish,
        );
      } else if (kind === "tub") {
        part(
          new THREE.BoxGeometry(4.2, 0.9, 2.2),
          new THREE.Vector3(0, 0.5, 0),
          accent,
        );
        part(
          new THREE.BoxGeometry(3.4, 0.12, 1.5),
          new THREE.Vector3(0, 0.98, 0),
          new THREE.MeshStandardMaterial({
            color: 0xbdebed,
            roughness: 0.16,
            metalness: 0.22,
          }),
        );
      } else if (kind === "sink") {
        part(
          new THREE.BoxGeometry(2.3, 1.5, 1.2),
          new THREE.Vector3(0, 0.75, 0),
        );
        part(
          new THREE.CylinderGeometry(0.55, 0.55, 0.12, 30),
          new THREE.Vector3(0, 1.52, 0),
          accent,
        );
        part(
          new THREE.TorusGeometry(0.28, 0.07, 12, 24, Math.PI),
          new THREE.Vector3(0.5, 1.8, 0),
          accent,
        );
      } else if (kind === "light") {
        part(
          new THREE.CylinderGeometry(0.7, 0.35, 0.3, 32),
          new THREE.Vector3(0, 2.8, 0),
          accent,
        );
        part(
          new THREE.SphereGeometry(0.42, 24, 16),
          new THREE.Vector3(0, 2.4, 0),
          new THREE.MeshStandardMaterial({
            color: 0xffe4a6,
            emissive: 0xffb52e,
            emissiveIntensity: 1.4,
          }),
        );
      }
      group.position.copy(center).add(new THREE.Vector3(0, 0.8, 0));
      group.userData["ascensionName"] = `CAD ${kind}`;
      group.traverse((node) => {
        node.userData["ascensionRoot"] = group;
      });
      editable.add(group);
      componentObjects.set(group.uuid,group);
      addedObjects.add(group);
      remember(()=>{group.removeFromParent();componentObjects.delete(group.uuid);addedObjects.delete(group);editable.delete(group);});
      const blue = finish.clone();
      blue.color.set("#6bbbd7");
      group.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        materials.set(node, node.material);
        sourceMaterials.set(node, node.material);
        const nodeBlue = (Array.isArray(node.material) ? node.material : [node.material]).map(
          (material) => {
            const clone = material.clone();
            if ("color" in clone && clone.color instanceof THREE.Color) clone.color.set("#6bbbd7");
            return clone;
        });
        blueprintMaterials.set(
          node,
          Array.isArray(node.material) ? nodeBlue : nodeBlue[0],
        );
        sourceBlueprintMaterials.set(
          node,
          Array.isArray(node.material) ? nodeBlue : nodeBlue[0],
        );
      });
      scene.add(group);
      setSelected(group);
      refreshComponents();
    };
    const removeObject = () => {
      if (!selected) return;
      editable.delete(selected);
      addedObjects.delete(selected);
      selected.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          materials.delete(node);
          sourceMaterials.delete(node);
          blueprintMaterials.delete(node);
          sourceBlueprintMaterials.delete(node);
          node.geometry.dispose();
          (Array.isArray(node.material)
            ? node.material
            : [node.material]
          ).forEach((m) => m.dispose());
        }
      });
      selected.parent?.remove(selected);
      setSelected(null);
    };
    const configureOrbit = () => {
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.12;
      orbit.minDistance = 0.08;
      orbit.maxDistance = 100;
      orbit.minZoom = 0.2;
      orbit.maxZoom = 40;
      orbit.zoomToCursor = true;
      orbit.screenSpacePanning = true;
    };
    configureOrbit();
    scene.add(new THREE.HemisphereLight(0xe9f5ff, 0x45515b, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(8, 12, 10);
    key.castShadow = true;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x85b9ff, 1.4);
    fill.position.set(-8, 3, -6);
    scene.add(fill);
    const rim = new THREE.PointLight(0x6cdcff, 3.2, 30, 1.6);
    rim.position.set(-5, 4, 7);
    scene.add(rim);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(250, 250),
      new THREE.MeshStandardMaterial({ color: 0x899b98, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.visible = false;
    scene.add(floor);
    const grid = new THREE.GridHelper(100, 100, 0x5797c4, 0x163454);
    grid.visible = false;
    scene.add(grid);
    const disposeRoom = () => {
      roomMeshes.splice(0).forEach((mesh) => {
        mesh.geometry.dispose();
        (Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        ).forEach((material) => material.dispose());
      });
      roomEnvironment.clear();
    };
    const roomMesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: THREE.Vector3,
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      roomMeshes.push(mesh);
      roomEnvironment.add(mesh);
      return mesh;
    };
    const buildRoom = (name: string) => {
      disposeRoom();
      const y = floor.position.y || -3;
      const wall = new THREE.MeshStandardMaterial({
        color:
          name === "Bathroom"
            ? 0x8aaeb8
            : name === "Living Area"
              ? 0x9b806b
              : name === "Bedroom"
                ? 0x645f83
                : name === "Kitchen"
                  ? 0x8f9b96
                  : name === "Garage"
                    ? 0x59636c
                    : 0x547889,
        roughness: 0.7,
      });
      const trim = new THREE.MeshStandardMaterial({
        color:
          name === "Bathroom"
            ? 0xd8f4f5
            : name === "Bedroom"
              ? 0xd6c5f4
              : name === "Kitchen"
                ? 0xe3e8dc
                : name === "Garage"
                  ? 0xb6c0c6
                  : 0x2b4553,
        roughness: 0.42,
        metalness: 0.12,
      });
      roomMesh(
        new THREE.BoxGeometry(24, 0.18, 18),
        new THREE.MeshStandardMaterial({
          color:
            name === "Bathroom"
              ? 0x596d73
              : name === "Living Area"
                ? 0x5e4737
                : name === "Bedroom"
                  ? 0x302d4d
                  : name === "Kitchen"
                    ? 0x4e5752
                    : name === "Garage"
                      ? 0x333d44
                      : 0x304d58,
          roughness: 0.82,
        }),
        new THREE.Vector3(0, y, 0),
      );
      roomMesh(
        new THREE.BoxGeometry(24, 9, 0.18),
        wall,
        new THREE.Vector3(0, y + 4.5, -9),
      );
      roomMesh(
        new THREE.BoxGeometry(0.18, 9, 18),
        wall,
        new THREE.Vector3(-12, y + 4.5, 0),
      );
      roomMesh(
        new THREE.BoxGeometry(0.18, 9, 18),
        wall.clone(),
        new THREE.Vector3(12, y + 4.5, 0),
      );
      roomMesh(
        new THREE.BoxGeometry(24, 0.18, 18),
        new THREE.MeshStandardMaterial({ color: 0x24333c, roughness: 0.9 }),
        new THREE.Vector3(0, y + 9, 0),
      );
      if (name === "Workspace") {
        roomMesh(
          new THREE.BoxGeometry(8, 0.35, 3),
          trim,
          new THREE.Vector3(-1, y + 2.2, -2),
        );
        roomMesh(
          new THREE.BoxGeometry(0.25, 2.2, 0.25),
          trim,
          new THREE.Vector3(-4, y + 1.1, -3),
        );
        roomMesh(
          new THREE.BoxGeometry(0.25, 2.2, 0.25),
          trim,
          new THREE.Vector3(2, y + 1.1, -3),
        );
        roomMesh(
          new THREE.BoxGeometry(3.4, 1.8, 0.18),
          new THREE.MeshStandardMaterial({
            color: 0x142a37,
            emissive: 0x164e65,
            emissiveIntensity: 0.7,
          }),
          new THREE.Vector3(-1, y + 3.35, -3.25),
        );
        roomMesh(
          new THREE.CylinderGeometry(0.18, 0.22, 2.4, 20),
          trim,
          new THREE.Vector3(5, y + 1.2, -2),
        );
        roomMesh(
          new THREE.SphereGeometry(0.55, 24, 14),
          new THREE.MeshStandardMaterial({
            color: 0x9ae8ff,
            emissive: 0x2d9fbd,
            emissiveIntensity: 0.7,
          }),
          new THREE.Vector3(5, y + 2.55, -2),
        );
      } else if (name === "Living Area") {
        roomMesh(
          new THREE.BoxGeometry(7, 1.6, 2.4),
          new THREE.MeshStandardMaterial({ color: 0x6f4737, roughness: 0.88 }),
          new THREE.Vector3(-1, y + 0.85, -3),
        );
        roomMesh(
          new THREE.BoxGeometry(7, 1.7, 0.35),
          trim,
          new THREE.Vector3(-1, y + 2.05, -4),
        );
        roomMesh(
          new THREE.CylinderGeometry(1.25, 1.25, 0.2, 32),
          new THREE.MeshStandardMaterial({ color: 0x997659, roughness: 0.9 }),
          new THREE.Vector3(3, y + 0.12, 1),
        );
        roomMesh(
          new THREE.CylinderGeometry(0.18, 0.22, 1.4, 20),
          trim,
          new THREE.Vector3(3, y + 0.8, 1),
        );
        roomMesh(
          new THREE.SphereGeometry(0.8, 24, 16),
          new THREE.MeshStandardMaterial({ color: 0x4c7b65, roughness: 0.9 }),
          new THREE.Vector3(5, y + 2.2, -1),
        );
      } else if (name === "Bedroom") {
        roomMesh(
          new THREE.BoxGeometry(7, 0.75, 5.5),
          new THREE.MeshStandardMaterial({ color: 0x6f5d78, roughness: 0.86 }),
          new THREE.Vector3(-1, y + 0.55, -3),
        );
        roomMesh(
          new THREE.BoxGeometry(7, 1.35, 0.35),
          trim,
          new THREE.Vector3(-1, y + 1.5, -5.5),
        );
        roomMesh(
          new THREE.BoxGeometry(2.3, 2.6, 0.55),
          trim,
          new THREE.Vector3(5, y + 1.3, -4),
        );
        roomMesh(
          new THREE.CylinderGeometry(0.45, 0.32, 1.6, 20),
          trim,
          new THREE.Vector3(5, y + 3.0, -4),
        );
        roomMesh(
          new THREE.BoxGeometry(5, 2.8, 0.12),
          new THREE.MeshStandardMaterial({
            color: 0x8bcbe0,
            emissive: 0x1c7087,
            emissiveIntensity: 0.25,
          }),
          new THREE.Vector3(-1, y + 4.4, -8.85),
        );
      } else if (name === "Kitchen") {
        roomMesh(
          new THREE.BoxGeometry(9, 1.6, 1.3),
          trim,
          new THREE.Vector3(-2, y + 0.8, -5.5),
        );
        roomMesh(
          new THREE.BoxGeometry(3.8, 1.1, 2.4),
          new THREE.MeshStandardMaterial({ color: 0x7e8c86, roughness: 0.48 }),
          new THREE.Vector3(2, y + 0.55, -1),
        );
        roomMesh(
          new THREE.BoxGeometry(2.3, 4.4, 1.3),
          new THREE.MeshStandardMaterial({ color: 0xc7d3ce, roughness: 0.5 }),
          new THREE.Vector3(7, y + 2.2, -5.5),
        );
        roomMesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.14, 28),
          new THREE.MeshStandardMaterial({
            color: 0xb9d8d4,
            metalness: 0.6,
            roughness: 0.18,
          }),
          new THREE.Vector3(-2, y + 1.65, -5.5),
        );
        roomMesh(
          new THREE.BoxGeometry(5, 2.8, 0.12),
          new THREE.MeshStandardMaterial({
            color: 0x8bcbe0,
            emissive: 0x1c7087,
            emissiveIntensity: 0.25,
          }),
          new THREE.Vector3(4, y + 4.3, -8.85),
        );
      } else if (name === "Garage") {
        roomMesh(
          new THREE.BoxGeometry(8, 1.4, 1.5),
          trim,
          new THREE.Vector3(-2, y + 0.7, -5.5),
        );
        roomMesh(
          new THREE.BoxGeometry(6.2, 0.35, 3.4),
          new THREE.MeshStandardMaterial({
            color: 0x6a7075,
            roughness: 0.7,
            metalness: 0.2,
          }),
          new THREE.Vector3(1, y + 1.5, -1),
        );
        roomMesh(
          new THREE.BoxGeometry(2.1, 2.7, 1.4),
          new THREE.MeshStandardMaterial({ color: 0x85919a, roughness: 0.55 }),
          new THREE.Vector3(7, y + 1.35, -4.5),
        );
        roomMesh(
          new THREE.BoxGeometry(8, 4.8, 0.14),
          new THREE.MeshStandardMaterial({
            color: 0x6d7e88,
            emissive: 0x1c3a4b,
            emissiveIntensity: 0.18,
          }),
          new THREE.Vector3(-1, y + 3.1, -8.85),
        );
      } else {
        roomMesh(
          new THREE.BoxGeometry(7, 1.2, 2.4),
          new THREE.MeshStandardMaterial({ color: 0xe7f0f0, roughness: 0.42 }),
          new THREE.Vector3(-2, y + 0.7, -3),
        );
        roomMesh(
          new THREE.BoxGeometry(4, 1.5, 0.8),
          trim,
          new THREE.Vector3(4, y + 0.75, -3),
        );
        roomMesh(
          new THREE.BoxGeometry(4.2, 3.2, 0.12),
          new THREE.MeshStandardMaterial({
            color: 0xc4e9ed,
            metalness: 0.6,
            roughness: 0.18,
          }),
          new THREE.Vector3(4, y + 3.8, -4.8),
        );
        roomMesh(
          new THREE.CylinderGeometry(0.6, 0.6, 0.14, 32),
          new THREE.MeshStandardMaterial({ color: 0xe7f7f8, roughness: 0.18 }),
          new THREE.Vector3(4, y + 1.55, -3),
        );
      }
    };
    const lines = new THREE.Group();
    scene.add(lines);
    const displayEdges: THREE.LineSegments[] = [];
    const materials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const sourceMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const blueprintMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const sourceBlueprintMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const blueprintMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f8fbe,
      roughness: 0.38,
      metalness: 0.22,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      side: THREE.DoubleSide,
    });
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xc6f2ff,
      transparent: true,
      opacity: 0.86,
    });
    const solidEdgeMaterial = new THREE.LineBasicMaterial({color:0x344654,transparent:true,opacity:0.45});
    const locationMarker=new THREE.Mesh(new THREE.SphereGeometry(0.09,12,8),new THREE.MeshBasicMaterial({color:0xffc96b,depthTest:false}));locationMarker.renderOrder=10;locationMarker.visible=false;scene.add(locationMarker);
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
    const bounds = new THREE.Vector3(10, 6, 6);
    const center = new THREE.Vector3();
    let activeMode: RealityMode = modeRef.current;
    let selected: THREE.Object3D | null = null;
    let selectedHelper: THREE.BoxHelper | null = null;
    const editable = new Set<THREE.Object3D>();
    const addedObjects = new Set<THREE.Object3D>();
    const originalTransforms = new Map<
      THREE.Object3D,
      {
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
        scale: THREE.Vector3;
      }
    >();
    let originalModelTransform: {
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
    } | null = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart = { x: 0, y: 0 };
    let fly = false;
    let width = 1,
      height = 1;
    const keys = new Set<string>();
    const look = { active: false, x: 0, y: 0 };
    const roomEnvironment = new THREE.Group();
    roomEnvironment.visible = false;
    scene.add(roomEnvironment);
    const roomMeshes: THREE.Mesh[] = [];
    if (!conceptual) buildRoom("Workspace");
    const controller = new AbortController();
    const disposeModel = (object: THREE.Object3D) => {
      const textures = new Set<THREE.Texture>();
      const used = new Set<THREE.Material>();
      object.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.dispose();
        for (const material of [materials.get(node) ?? node.material].flat()) {
          used.add(material);
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) textures.add(value);
        }
      });
      textures.forEach((texture) => {
        texture.dispose();
        if (texture.image instanceof ImageBitmap) texture.image.close();
      });
      used.forEach((material) => material.dispose());
    };
    const resize = () => {
      width = Math.max(1, target.clientWidth);
      height = Math.max(1, target.clientHeight);
      renderer.setSize(width, height);
      perspective.aspect = width / height;
      perspective.updateProjectionMatrix();
      const half = 7;
      orthographic.left = (-half * width) / height;
      orthographic.right = (half * width) / height;
      orthographic.top = half;
      orthographic.bottom = -half;
      orthographic.updateProjectionMatrix();
      if (model) fit();
    };
    const fit = () => {
      if (model) {
        const assemblyBox = new THREE.Box3().setFromObject(model);
        for(const object of addedObjects)if(object.parent)assemblyBox.union(new THREE.Box3().setFromObject(object));
        if(!assemblyBox.isEmpty()){assemblyBox.getSize(bounds);assemblyBox.getCenter(center);}
      }
      const radius = bounds.length() / 2;
      const angle = Math.min(
        THREE.MathUtils.degToRad(perspective.fov / 2),
        Math.atan(
          (Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) * width) /
            height,
        ),
      );
      const distance = (radius / Math.sin(angle)) * 1.07;
      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(0.8, 0.5, 1).normalize().multiplyScalar(distance),
        );
      camera.up.set(0, 1, 0);
      orthographic.zoom =
        Math.min(
          14 / Math.max(bounds.y, bounds.z),
          (14 * width) / height / bounds.x,
        ) * 0.75;
      orthographic.updateProjectionMatrix();
      orbit.target.copy(center);
      camera.lookAt(center);
      orbit.update();
    };
    const applyBackground = (preset: string) => {
      const presets: Record<string, { color: number; light: number }> = {
        daylight: { color: 0x171b22, light: 2.5 },
        dusk: { color: 0x3a3f66, light: 2.1 },
        night: { color: 0x0b1426, light: 1.1 },
        blueprint: { color: 0x101923, light: 2.4 },
      };
      const selected = presets[preset] ?? presets["daylight"]!;
      scene.background = new THREE.Color(selected.color);
      key.intensity = selected.light;
      fill.intensity = selected.light * 0.45;
    };
    const setReactMode = setMode;
    const applyMode = (next: RealityMode) => {
      activeMode = next;
      fly = false;
      keys.clear();
      orbit.dispose();
      transform.detach();
      camera = next === "blueprint" ? orthographic : perspective;
      transform.camera = camera;
      orbit = new OrbitControls(camera, renderer.domElement);
      configureOrbit();
      floor.visible = next === "environment";
      floor.receiveShadow = next === "environment";
      roomEnvironment.visible = next === "environment" && !conceptual;
      grid.visible = next === "blueprint";
      lines.visible = false;
      displayEdges.forEach(edge=>{edge.visible=true;edge.material=next==="blueprint"?edgeMaterial:solidEdgeMaterial;});
      transform.getHelper().visible = next !== "environment" || selected !== null;
      applyBackground(next === "blueprint" ? "blueprint" : backgroundColor);
      scene.fog = next === "environment" ? new THREE.Fog(0xbdced7, 45, 150) : null;
      for (const [mesh, original] of materials)
        mesh.material =
          next === "blueprint" ? (blueprintMaterials.get(mesh) ?? blueprintMaterial) : original;
      plane.constant = 100;
      renderer.clippingPlanes = [];
      fit();
      if (next === "environment") {
        camera.position.sub(orbit.target).multiplyScalar(1.28).add(orbit.target);
        orbit.update();
      }
    };
    const componentObjects = new Map<string, THREE.Object3D>();
    const componentDetails = new Map<string, DesignPart>();
    const history: Array<() => void> = [];
    const refreshComponents = () => setComponents([...componentObjects.values()].filter(object=>object.parent).map(object=>({id:object.uuid,name:object.userData["ascensionName"] ?? object.name ?? "Component",detail:componentDetails.get(object.uuid)??null})));
    const remember = (undo:()=>void) => {edited.current=true;history.push(undo);if(history.length>30)history.shift();setUndoCount(history.length);};
    const snapshot = (object:THREE.Object3D) => {
      const parent=object.parent;const position=object.position.clone();const rotation=object.quaternion.clone();const scale=object.scale.clone();
      return ()=>{if(parent)parent.add(object);else object.removeFromParent();object.position.copy(position);object.quaternion.copy(rotation);object.scale.copy(scale);object.updateWorldMatrix(true,true);};
    };
    transform.addEventListener("mouseDown",()=>{if(selected)remember(snapshot(selected));});
    const partAnchors: THREE.Vector3[] = [];
    const partObjects: THREE.Object3D[] = [];
    const partNames:string[]=[];
    let locatedPart:number|null=null;
    let annotationCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera = camera.clone();
    const explodedPositions = new Map<THREE.Object3D, THREE.Vector3>();
    const controls: ViewerControls = {
      explode(enabled) { if (model && conceptual) { explodeAssembly(model, enabled, explodedPositions); fit(); } },
      locatePart(index){
        const anchor=partAnchors[index],object=partObjects[index];if(!model||!anchor||!object)return;
        locatedPart=index;locationMarker.visible=true;locationMarker.position.copy(object.localToWorld(anchor.clone()));
        setSelected(componentDetails.get(object.uuid)?.name===partNames[index]?object:null);orbit.target.copy(locationMarker.position);orbit.update();
      },
      selectComponent(id) {
        const object=componentObjects.get(id);if(!object?.parent)return;
        setSelected(object);
        const box=new THREE.Box3().setFromObject(object);orbit.target.copy(box.getCenter(new THREE.Vector3()));orbit.update();
      },
      combine(sourceId,targetId,blend) {
        const source=componentObjects.get(sourceId),target=componentObjects.get(targetId);
        if(!source?.parent||!target?.parent||source===target||isAncestor(source,target)||isAncestor(target,source))throw new Error("Choose two independent components.");
        const undo=snapshot(source);
        attachComponent(source,target);
        if(blend){
          const group=new THREE.Group();group.name=`Blend: ${source.name} + ${target.name}`;
          const parent=target.parent!;const undoTarget=snapshot(target);parent.add(group);group.attach(target);componentObjects.set(group.uuid,group);
          remember(()=>{undo();undoTarget();group.removeFromParent();componentObjects.delete(group.uuid);});setSelected(group);
        }else{remember(undo);setSelected(source);}
        refreshComponents();
      },
      undo(){history.pop()?.();setUndoCount(history.length);setSelected(null);refreshComponents();},
      async exportAssembly(){
        const exportRoot=new THREE.Group();
        for(const object of componentObjects.values())if(object.parent && ![...componentObjects.values()].some(other=>other!==object && isAncestor(other,object))) {
          const cleanClone=(node:THREE.Object3D):THREE.Object3D=>{const copy=node instanceof THREE.Mesh ? new THREE.Mesh(node.geometry,node.material) : new THREE.Group();copy.name=node.userData["ascensionName"]??node.name;copy.position.copy(node.position);copy.quaternion.copy(node.quaternion);copy.scale.copy(node.scale);copy.matrixAutoUpdate=node.matrixAutoUpdate;if(!node.matrixAutoUpdate)copy.matrix.copy(node.matrix);copy.userData={componentName:copy.name};node.children.filter(child=>!child.userData["ascensionDisplayEdge"]).forEach(child=>copy.add(cleanClone(child)));return copy;};
          const clone=cleanClone(object);object.updateWorldMatrix(true,true);object.matrixWorld.decompose(clone.position,clone.quaternion,clone.scale);exportRoot.add(clone);
        }
        const output=await new GLTFExporter().parseAsync(exportRoot,{binary:true});
        if(!(output instanceof ArrayBuffer))throw new Error("Assembly export failed.");
        const url=URL.createObjectURL(new Blob([output],{type:"model/gltf-binary"}));const link=document.createElement("a");link.href=url;link.download="ASCENSION_assembly.glb";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      },
      picture() {
        renderer.render(scene, camera);
        annotationCamera = camera.clone();
        const image = document.createElement("canvas");
        image.width = Math.min(1024, renderer.domElement.width);
        image.height = Math.round(image.width * renderer.domElement.height / renderer.domElement.width);
        image.getContext("2d")!.drawImage(renderer.domElement, 0, 0, image.width, image.height);
        return image.toDataURL("image/jpeg", 0.85);
      },
      anchorParts(parts) {
        partAnchors.length = 0;partObjects.length=0;partNames.length=0;
        if (!model) return [];
        const visible: DesignPart[] = [];
        for (const part of parts) {
          const ray = new THREE.Raycaster();
          ray.setFromCamera(new THREE.Vector2(part.x * 2 - 1, 1 - part.y * 2), annotationCamera);
          const hit = ray.intersectObject(model, true).find(hit=>hit.object instanceof THREE.Mesh);
          if (!hit) continue;
          const hitObject=hit.object;
          partObjects.push(hitObject);partNames.push(part.name);
          if(componentObjects.size>1 && componentObjects.has(hitObject.uuid) && !componentDetails.has(hitObject.uuid)) {
            componentDetails.set(hitObject.uuid,part);
            hitObject.userData["ascensionName"]=part.name;
          }
          partAnchors.push(hitObject.worldToLocal(hit.point.clone()));
          visible.push(part);
        }
        refreshComponents();
        return visible;
      },
      mode: applyMode,
      fit,
      zoom(factor) {
        if (camera instanceof THREE.OrthographicCamera) {
          camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, 0.2, 40);
          camera.updateProjectionMatrix();
        } else {
          camera.position
            .sub(orbit.target)
            .multiplyScalar(1 / factor)
            .add(orbit.target);
        }
        orbit.update();
      },
      view(view) {
        fly = false;
        orbit.enabled = true;
        const direction =
          view === "top"
            ? new THREE.Vector3(0, 1, 0)
            : view === "front"
              ? new THREE.Vector3(0, 0, 1)
              : view === "side"
                ? new THREE.Vector3(1, 0, 0)
                : new THREE.Vector3(0.8, 0.5, 1).normalize();
        if (view === "perspective" && !(camera instanceof THREE.PerspectiveCamera)) {
          orbit.dispose();
          camera = perspective;
          transform.camera = camera;
          orbit = new OrbitControls(camera, renderer.domElement);
          configureOrbit();
        } else if (view !== "perspective" && !(camera instanceof THREE.OrthographicCamera)) {
          orbit.dispose();
          camera = orthographic;
          transform.camera = camera;
          orbit = new OrbitControls(camera, renderer.domElement);
          configureOrbit();
        }
        const distance = Math.max(bounds.length() * 1.35, 8);
        camera.position.copy(center).addScaledVector(direction, distance);
        camera.up.copy(
          view === "top"
            ? new THREE.Vector3(0, 0, -1)
            : new THREE.Vector3(0, 1, 0),
        );
        orbit.target.copy(center);
        camera.lookAt(center);
        orbit.update();
      },
      section(value) {
        plane.constant = center.y - bounds.y / 2 + (bounds.y * value) / 100;
        renderer.clippingPlanes = value >= 100 ? [] : [plane];
      },
      explore(enabled) {
        fly = enabled;
        keys.clear();
        orbit.enabled = !enabled;
        if (enabled) {
          camera = perspective;
          transform.camera = perspective;
          camera.position.set(0, center.y - bounds.y * 0.18, bounds.z * 0.75);
          camera.lookAt(center.x, camera.position.y, center.z);
          renderer.domElement.focus();
        } else {
          camera.getWorldDirection(orbit.target).multiplyScalar(2).add(camera.position);
          orbit.update();
        }
      },
      move(direction, down) {
        if (down) keys.add(direction);
        else keys.delete(direction);
      },
      transform(next) {
        transform.setMode(next);
        setTransformMode(next);
      },
      add: addObject,
      remove: removeObject,
      color: applyObjectColor,
      background(value) {
        setBackgroundColor(value);
        applyBackground(value);
      },
      space(value) {
        const nextSpace = ROOM_OPTIONS.includes(value as RoomName)
          ? (value as RoomName)
          : "Workspace";
        setSpace(nextSpace);
        buildRoom(nextSpace);
        roomEnvironment.visible = true;
        floor.visible = true;
        camera.position
          .copy(center)
          .add(
            new THREE.Vector3(
              nextSpace === "Bathroom" ? -1 : nextSpace === "Living Area" ? 1 : 0.8,
              0.5,
              1,
            )
              .normalize()
              .multiplyScalar(Math.max(8, camera.position.distanceTo(center))),
          );
        camera.lookAt(center);
        orbit.target.copy(center);
      },
      reset() {
        const startingMode =
          "cutaway";
        while(history.length)history.pop()!();
        setUndoCount(0);
        setSelected(null);
        for (const object of [...addedObjects]) {
          object.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            node.geometry.dispose();
            (Array.isArray(node.material)
              ? node.material
              : [node.material]
            ).forEach((material) => material.dispose());
            materials.delete(node);
            sourceMaterials.delete(node);
            blueprintMaterials.delete(node);
            sourceBlueprintMaterials.delete(node);
          });
          object.parent?.remove(object);
          editable.delete(object);
        }
        addedObjects.clear();
        refreshComponents();
        for (const [object, snapshot] of originalTransforms) {
          object.position.copy(snapshot.position);
          object.quaternion.copy(snapshot.quaternion);
          object.scale.copy(snapshot.scale);
        }
        if (model && originalModelTransform) {
          model.position.copy(originalModelTransform.position);
          model.quaternion.copy(originalModelTransform.quaternion);
          model.scale.copy(originalModelTransform.scale);
          model.updateMatrixWorld(true);
        }
        for (const [mesh, source] of sourceMaterials) {
          mesh.material = source;
          materials.set(mesh, source);
          const blueprint = sourceBlueprintMaterials.get(mesh);
          if (blueprint) blueprintMaterials.set(mesh, blueprint);
        }
        renderer.clippingPlanes = [];
        if (model) floor.position.y = new THREE.Box3().setFromObject(model).min.y - 0.03;
        grid.position.y = floor.position.y - 0.01;
        buildRoom("Workspace");
        applyMode(startingMode);
        applyBackground("daylight");
        fly = false;
        keys.clear();
        orbit.enabled = true;
        setArrived(true);
        setReactMode(startingMode);
        setTransformMode("translate");
        setAddKind("box");
        setObjectColor("#6ed7ff");
        setBackgroundColor("daylight");
        setSpace("Workspace");
        setSection(100);
        setExploring(false);
        setError(null);
      },
    };
    api.current = controls;
    resize();
    applyMode(activeMode);
    const observer = new ResizeObserver(resize);
    observer.observe(target);
    const down = (event: KeyboardEvent) => {
      if (
        !fly ||
        event.target instanceof HTMLInputElement ||
        ![
          "w",
          "a",
          "s",
          "d",
          "q",
          "e",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      keys.add(event.key);
    };
    const up = (event: KeyboardEvent) => {
      keys.delete(event.key);
    };
    const blur = () => {
      keys.clear();
      look.active = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    const pointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY };
      if (!fly) return;
      look.active = true;
      look.x = event.clientX;
      look.y = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!fly || !look.active) return;
      const euler = new THREE.Euler().setFromQuaternion(
        camera.quaternion,
        "YXZ",
      );
      euler.y -= (event.clientX - look.x) * 0.004;
      euler.x = THREE.MathUtils.clamp(
        euler.x - (event.clientY - look.y) * 0.004,
        -1.5,
        1.5,
      );
      camera.quaternion.setFromEuler(euler);
      look.x = event.clientX;
      look.y = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => {
      if (
        !fly &&
        Math.hypot(
          event.clientX - pointerStart.x,
          event.clientY - pointerStart.y,
        ) < 7
      ) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects([...editable], true);
        const hit = hits.find(hit=>hit.object instanceof THREE.Mesh)?.object ?? null;
        const root = hit?.userData["ascensionRoot"] as THREE.Object3D | undefined;
        setSelected(root ?? hit);
      }
      look.active = false;
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerUp);
    let previous = performance.now();
    const demoMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const demoOverlay = new THREE.MeshBasicMaterial({color: solidEdgeMaterial.color, wireframe:true, transparent:true, opacity:0.85, depthTest:false});
    const demoCue = new THREE.Mesh(new THREE.SphereGeometry(0.12,12,8),demoOverlay);
    demoCue.visible=false;scene.add(demoCue);
    renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (selectedHelper) selectedHelper.update();
      if (fly) {
        const speed = dt * 2.5;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        if (keys.has("w") || keys.has("ArrowUp")) camera.position.addScaledVector(forward, speed);
        if (keys.has("s") || keys.has("ArrowDown"))
          camera.position.addScaledVector(forward, -speed);
        if (keys.has("a") || keys.has("ArrowLeft")) camera.position.addScaledVector(right, -speed);
        if (keys.has("d") || keys.has("ArrowRight")) camera.position.addScaledVector(right, speed);
        if (keys.has("e")) camera.position.y += speed;
        if (keys.has("q")) camera.position.y -= speed;
      } else orbit.update();
      if(locatedPart!==null && model && partAnchors[locatedPart])locationMarker.position.copy(partObjects[locatedPart]!.localToWorld(partAnchors[locatedPart]!.clone()));
      // Temporal causal emphasis on grounded named meshes; never mutate user transforms.
      demoMaterials.forEach((material,mesh)=>{mesh.material=material;});demoMaterials.clear();demoCue.visible=false;
      const demo=demoRef.current;
      if(demo.active && model){
        const related=[...componentObjects.values()].filter(object=>demo.names.includes(componentDetails.get(object.uuid)?.name ?? ''));
        related.forEach(object=>{if(object instanceof THREE.Mesh){demoMaterials.set(object,object.material);object.material=demoOverlay;}});
        const first=related[0],last=related[related.length-1];
        if(first && last){const from=new THREE.Box3().setFromObject(first).getCenter(new THREE.Vector3());const to=new THREE.Box3().setFromObject(last).getCenter(new THREE.Vector3());demoCue.position.copy(from.lerp(to,demo.reduced?0:demo.progress));demoCue.scale.setScalar(demo.reduced?1:1+Math.sin(demo.progress*Math.PI)*2);demoCue.visible=true;}
      }
      renderer.render(scene, camera);
      const occupiedLabels: DOMRect[] = [];
      labelsHost.current?.querySelectorAll<HTMLButtonElement>("button").forEach((button, index) => {
        const anchor = partAnchors[index];
        if (!anchor || !model) { button.hidden = true; return; }
        const projected = partObjects[index]!.localToWorld(anchor.clone()).project(camera);
        button.hidden = projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
        button.style.left = `${(projected.x + 1) * 50}%`;
        button.style.top = `${(1 - projected.y) * 50}%`;
        if (!button.hidden) {
          const rect = button.getBoundingClientRect();
          button.hidden = occupiedLabels.some(other => rect.left < other.right + 4 && rect.right > other.left - 4 && rect.top < other.bottom + 4 && rect.bottom > other.top - 4);
          if (!button.hidden) occupiedLabels.push(rect);
        }
      });
    });
      void (async () => {
        try {
        if (loadedUrl) {
          const response = await fetch(loadedUrl, { signal: controller.signal });
          if (!response.ok) throw new Error(`Model download returned HTTP ${response.status}`);
          const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), new URL(".", loadedUrl).href);
          if (disposed) { disposeModel(gltf.scene); return; }
          model = gltf.scene;
        } else {
          model = buildCanonicalAssembly(objective, pathway);
        }
          const meshes:THREE.Mesh[]=[];model.traverse(node=>{if(node instanceof THREE.Mesh)meshes.push(node);});
          for(const mesh of conceptual ? [] : meshes){
            const pieces=splitMeshIslands(mesh);
            if(pieces.length>1){const holder=new THREE.Group();holder.position.copy(mesh.position);holder.quaternion.copy(mesh.quaternion);holder.scale.copy(mesh.scale);mesh.parent!.add(holder);pieces.forEach(piece=>holder.add(piece));mesh.removeFromParent();mesh.geometry.dispose();}
          }
          const box = new THREE.Box3().setFromObject(model);
          if (box.isEmpty()) throw new Error("This model contains no visible geometry.");
          const rawSize = box.getSize(new THREE.Vector3());
          const scale = 10 / Math.max(rawSize.x, rawSize.y, rawSize.z);
          model.scale.multiplyScalar(scale);
        model.position.sub(
          box.getCenter(new THREE.Vector3()).multiplyScalar(scale),
        );
          model.updateMatrixWorld(true);
          const normalized = new THREE.Box3().setFromObject(model);
          normalized.getSize(bounds);
          normalized.getCenter(center);
          originalModelTransform = {
            position: model.position.clone(),
            quaternion: model.quaternion.clone(),
            scale: model.scale.clone(),
          };
          model.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
                        const palette=[0x8da9b8,0xb59a75,0x739ba2,0x9b92b7,0x87a395,0xb0a08c];
            const displayMaterials=[node.material].flat().map(material=>{
              const copy=material.clone();copy.side=THREE.DoubleSide;
              if("color" in copy && copy.color instanceof THREE.Color && !((copy as THREE.MeshStandardMaterial).map)) {
                const color=copy.color;
                if(Math.max(color.r,color.g,color.b)-Math.min(color.r,color.g,color.b)<0.1 && color.r>0.7)color.setHex(palette[componentObjects.size%palette.length]!);
              }
              if("roughness" in copy)copy.roughness=0.65;
              if("metalness" in copy)copy.metalness=0.15;
              return copy;
            });
            node.material=Array.isArray(node.material)?displayMaterials:displayMaterials[0]!;
            materials.set(node, node.material);
            sourceMaterials.set(node, node.material);
            originalTransforms.set(node, {
              position: node.position.clone(),
              quaternion: node.quaternion.clone(),
              scale: node.scale.clone(),
            });
            const nodeBlue = (Array.isArray(node.material) ? node.material : [node.material]).map(
              (material) => {
                const clone = material.clone();
                if ("color" in clone && clone.color instanceof THREE.Color)
                  clone.color.set("#315366");
                if ("roughness" in clone) clone.roughness = 0.7;
                if ("metalness" in clone) clone.metalness = 0.18;
                return clone;
          });
          blueprintMaterials.set(
            node,
            Array.isArray(node.material) ? nodeBlue : nodeBlue[0],
            );
            sourceBlueprintMaterials.set(
              node,
              Array.isArray(node.material) ? nodeBlue : nodeBlue[0],
            );
            editable.add(node);
            if(!node.name || /^(?:mesh|component|part|diagram|label)(?:[ _.-]*[a-z0-9]+)?$/i.test(node.name))node.name=`Unidentified geometry ${componentObjects.size+1}`;
            componentObjects.set(node.uuid,node);
            const detail = node.userData["conceptPart"] as DesignPart | undefined;
            if (detail) {
              componentDetails.set(node.uuid, detail);
              partObjects.push(node); partNames.push(detail.name); partAnchors.push(new THREE.Vector3());
            }
            const edge = new THREE.LineSegments(
              new THREE.EdgesGeometry(node.geometry, 12),
              edgeMaterial,
            );
            edge.userData["ascensionDisplayEdge"]=true;edge.material=modeRef.current==="blueprint"?edgeMaterial:solidEdgeMaterial;
            node.add(edge);displayEdges.push(edge);
          });
          floor.position.y = normalized.min.y - 0.03;
          grid.position.y = normalized.min.y - 0.04;
          if (!conceptual) buildRoom(space);
          scene.add(model);
          setMode(modeRef.current);
          refreshComponents();
          applyMode(modeRef.current);
          renderer.domElement.dataset["source"] = conceptual ? "concept" : "glb";
          renderer.domElement.dataset["meshCount"] = String(componentObjects.size);
          setReady(true);
        } catch (cause) {
          if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
        }
      })();
    return () => {
      disposed = true;
      controller.abort();
      api.current = null;
      renderer.setAnimationLoop(null);
      demoMaterials.forEach((material,mesh)=>{mesh.material=material;});demoOverlay.dispose();demoCue.geometry.dispose();
      observer.disconnect();
      orbit.dispose();
      transform.dispose();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      if (model) disposeModel(model);
      disposeRoom();
      lines.children.forEach((node) => {
        if (node instanceof THREE.LineSegments) node.geometry.dispose();
      });
      blueprintMaterials.forEach((material) => {
        for (const item of [material].flat()) item.dispose();
      });
      blueprintMaterial.dispose();
      displayEdges.forEach(edge=>edge.geometry.dispose());
      edgeMaterial.dispose();
      solidEdgeMaterial.dispose();locationMarker.geometry.dispose();locationMarker.material.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      grid.geometry.dispose();
      for (const material of [grid.material].flat()) material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [pathway.id, loadedUrl, attempt]);

  useEffect(() => {
    api.current?.mode(mode);
    setSection(100);
    setExploring(false);
  }, [mode]);

  return createPortal(
    <dialog
      ref={dialog}
      className="reality-screen"
      data-mode={mode}
      data-visual-source={conceptual ? "concept" : "glb"}
      data-arrived={arrived}
      aria-label={`${pathway.label} — immersive reality`}
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
    >
      {!arrived && (
        <div className="reality-dive" data-entering={ready} aria-hidden="true">
          <img src="/approved-scene/ascension-tree-behind-book-hq.jpg" alt="" />
          <div className="reality-dive-title">
            <span>{ready ? "DIVING INTO" : "AT THE THRESHOLD"}</span>
            <h2>{pathway.label}</h2>
          </div>
        </div>
      )}
      <header className="reality-header">
        <div className="reality-navigation">
        <Button variant="outline" className="reality-back" onClick={onClose}>
          ← BACK TO PATHWAYS
        </Button>
        <Button variant="outline" onClick={onNewObjective} disabled={newObjectiveDisabled}>
          NEW OBJECTIVE
        </Button>
        <div className="reality-title">
          <span>{conceptual ? `CONCEPT / UNVERIFIED · ${pathway.model_spec || pathwayKind(pathway, objective) !== "generic" ? "SEMANTIC ASSEMBLY" : "INTERPRETIVE DIAGRAM · PHYSICAL GEOMETRY UNAVAILABLE"}` : "HUNYUAN3D MESH / UNVERIFIED"}</span>
          {conceptual && <p className="reality-pathway-label">{pathway.model_error ? `GLB: ${pathway.model_error}` : pathway.model_status ? `GLB creation: ${pathway.model_status}` : "Physical model unavailable · Concept available now"}</p>}
          {pathway.model_url && loadedUrl !== pathway.model_url && <Button variant="outline" onClick={() => { edited.current = false; setLoadedUrl(pathway.model_url); }}>REPLACE EDITED CONCEPT WITH HUNYUAN MODEL</Button>}
          <h1>{objective}</h1>
          <p className="reality-pathway-label">{pathway.label}</p>
        </div>
        </div>
        <div className="reality-view-controls" role="group" aria-label="Drawing views and parts">
        <Button variant="outline" disabled={!ready} aria-pressed={!dissected && mode==="cutaway"} onClick={()=>{setDissected(false);setMode("cutaway");}}>
          CUTAWAY
        </Button>
        <Button variant="outline" disabled={!ready} aria-pressed={!dissected && mode==="blueprint"} onClick={()=>{setDissected(false);setMode("blueprint");}}>
          BLUEPRINT
        </Button>
        <Button variant="outline" disabled={!ready} aria-pressed={!dissected && mode==="environment"} onClick={()=>{setDissected(false);setMode("environment");}}>
          ENVIRONMENT
        </Button>
        <Button variant="outline" disabled={!ready} aria-pressed={dissected} onClick={() => {setDissected(value=>!value);setPartIndex(null);}}>
          {dissected ? "ASSEMBLED" : "DISSECTED"}
        </Button>
        <Button variant="outline" className="reality-parts-tab" aria-expanded={showParts} aria-controls="reality-parts" aria-pressed={showParts} onClick={() => setShowParts(value => !value)}>
          PARTS
        </Button>
        <Button variant="outline" className="reality-sound" aria-pressed={soundEnabled} onClick={()=>{onToggleSound();if(!soundEnabled)window.setTimeout(()=>realityFeedback(),100);}}>
          {soundEnabled ? "SOUND ON" : "SOUND OFF"}
        </Button>
        </div>
        <div className="reality-extra-controls">
          <Button variant="outline" aria-pressed={simulate} onClick={()=>{setSimulate(value=>!value);setPlaying(false);}}>SIMULATE</Button>
          <label>Volume <input aria-label="Ambient volume" type="range" min="0" max="0.7" step="0.05" value={volume} onChange={event=>setVolume(Number(event.target.value))}/></label>
        </div>
      </header>
      <div className="reality-model-stage">
        <div ref={host} className="reality-viewport" data-ready={ready} style={{visibility:(dissected && dissection) || (simulate && interpretiveDemo) ? "hidden" : "visible"}} />
        {dissected && dissection && <RealityDissection imageUrl={dissection.imageUrl} parts={dissection.parts} selected={partIndex} label={pathway.label} onSelect={index=>{setPartIndex(index);setShowParts(true);}}/>}
        {simulate && interpretiveDemo && !dissected && phases.length > 0 && <div className="reality-semantic-sequence" aria-label="Animated pathway storyboard">
          <span>CONCEPTUAL PROCESS · {frame.index + 1} / {phases.length}</span>
          <h2>{phases[frame.index]?.caption}</h2>
          {phases[frame.index]?.operation && <p>{phases[frame.index]?.operation}</p>}
          <progress aria-label="Current phase progress" max={1} value={frame.progress}/>
          {phases[frame.index + 1] && <p className="reality-sequence-next">→ {phases[frame.index + 1]?.caption}</p>}
        </div>}
        {simulate && <section className="reality-demonstration" aria-label="Conceptual demonstration">
          <strong>CONCEPTUAL DEMONSTRATION · UNVERIFIED</strong>
          {!phases.length ? <p role="status">Operational animation unavailable</p> : <>
            <div className="reality-demo-flow" aria-label="Pathway process">{phases.map((phase,index)=><span key={index} aria-current={index===frame.index?'step':undefined}>{phase.caption}</span>)}<i style={{left:`${seconds/DEMONSTRATION_SECONDS*100}%`}} aria-hidden="true"/></div>
            <p aria-live="polite">{phases[frame.index]?.caption}</p>
            {phases[frame.index]?.operation && <p>{phases[frame.index]?.operation}</p>}
            <div className="reality-demo-actions"><Button variant="outline" onClick={()=>{if(seconds>=DEMONSTRATION_SECONDS)setSeconds(0);setPlaying(value=>!value);}}>{playing?'PAUSE':'PLAY'}</Button><Button variant="outline" onClick={()=>{setSeconds(0);setPlaying(true);}}>REPLAY</Button><input aria-label="Demonstration timeline" type="range" min="0" max={DEMONSTRATION_SECONDS} step="0.05" value={seconds} onChange={event=>{setPlaying(false);setSeconds(Number(event.target.value));}}/><output>{seconds.toFixed(1)} / 12s</output></div>
          </>}
        </section>}
        {dissected && (dissectionLoading || dissectionError) && <div className="reality-status" role={dissectionError?"alert":"status"}>
          <p>{dissectionError ?? "Creating a separated, labeled concept view…"}</p>
          {dissectionError && <Button variant="outline" onClick={()=>setDissectionAttempt(value=>value+1)}>RETRY DISSECTED VIEW</Button>}
        </div>}
        {ready && !dissected && showParts && <div ref={labelsHost} className="reality-picture-labels" aria-label="Labels on the model">
          {activeParts.map((part, index) => <Button variant="outline" key={part.name + index} title={part.name} aria-pressed={partIndex === index} aria-controls="reality-part-detail" onClick={() => {setPartIndex(index);api.current?.locatePart(index);}}><span>{part.name}</span></Button>)}
        </div>}
      </div>
      {!ready && (
        <div className="reality-status" role={error ? "alert" : "status"}>
          <p>
            {error ??
              (!pathway.model_url
                ? (pathway.model_error ??
                  (pathway.model_status === "failed"
                    ? "The requested 3D drawing failed to generate."
                    : pathway.model_status
                      ? `Your requested 3D drawing is ${pathway.model_status}.`
                      : "Your requested 3D drawing has not been generated yet."))
                : "Loading your model…")}
          </p>
          {error && (
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              RETRY LOAD
            </Button>
          )}
        </div>
      )}
      {ready && (!dissected || !dissection) && (
      <aside className="reality-tools" aria-label="Model controls">
        <Button variant="outline" disabled={!ready} aria-label="Zoom in" onClick={() => api.current?.zoom(1.3)}>
          ＋
        </Button>
        <Button variant="outline" disabled={!ready} aria-label="Zoom out" onClick={() => api.current?.zoom(1 / 1.3)}>
          −
        </Button>
        <Button variant="outline"
          disabled={!ready}
          onClick={() => {
            setExploring(false);
            api.current?.explore(false);
            api.current?.fit();
          }}
        >
          FIT MODEL
        </Button>
        <Button variant="outline" disabled={!ready} onClick={() => api.current?.reset()}>
          RESET REALITY
        </Button>
      </aside>
      )}
      {(ready || showParts || dissected) && (
      <footer className="reality-footer">
        {showParts && (
          <section id="reality-parts" className="reality-parts" aria-label="Design parts">
            <Button variant="outline" className="reality-inspector-close" aria-label="Close part inspector" onClick={()=>setShowParts(false)}>✕</Button>
            {!dissected && <div className="reality-component-workbench">
              {!partsLoading && !partsError && <div className="reality-named-parts" aria-label="Named parts and functions">
                {activeParts.map((part,index)=><Button variant="outline" key={part.name+index} aria-pressed={partIndex===index} onClick={()=>{setPartIndex(index);api.current?.locatePart(index);}}><strong>{part.name}</strong><span>{part.purpose}</span></Button>)}
              </div>}
              <details className="reality-geometry-details" open={editorOpen} onToggle={event=>setEditorOpen(event.currentTarget.open)}><summary>Editable model components</summary>
              <div className="reality-component-list" aria-label="Editable components">
                {components.map(component=><Button variant="outline" key={component.id} aria-pressed={componentId===component.id} onClick={()=>{setPartIndex(null);api.current?.selectComponent(component.id);}}>{component.name}</Button>)}
              </div>
              <div className="reality-component-actions">
                {(["translate","rotate","scale"] as const).map(action=><Button variant="outline" key={action} disabled={!componentId} aria-pressed={transformMode===action} onClick={()=>api.current?.transform(action)}>{action==="translate"?"MOVE":action.toUpperCase()}</Button>)}
                <select aria-label="Target component B" value={targetId} onChange={event=>setTargetId(event.target.value)}><option value="">Choose component B</option>{components.filter(component=>component.id!==componentId).map(component=><option key={component.id} value={component.id}>{component.name}</option>)}</select>
                {[false,true].map(blend=><Button variant="outline" key={String(blend)} disabled={!componentId||!targetId} onClick={()=>{try{setWorkbenchError(null);if (componentId) api.current?.combine(componentId,targetId,blend);}catch(cause){setWorkbenchError(cause instanceof Error?cause.message:"Assembly change failed.");}}}>{blend?"BLEND ASSEMBLY":"ADD A TO B"}</Button>)}
                <select aria-label="New component shape" value={addKind} onChange={event=>setAddKind(event.target.value as CatalogKind)}>{(["box","sphere","cylinder","panel","beam","coil","motor","battery"] as const).map(kind=><option key={kind} value={kind}>{kind}</option>)}</select>
                <Button variant="outline" onClick={()=>api.current?.add(addKind)}>ADD COMPONENT</Button>
                <Button variant="outline" disabled={!undoCount} onClick={()=>api.current?.undo()}>UNDO</Button>
                <Button variant="outline" onClick={()=>{void api.current?.exportAssembly().catch(cause=>setWorkbenchError(String(cause)));}}>SAVE GLB</Button>
              </div>
              </details>
              <p className="reality-parts-hint">Select a component to highlight it. Drag its handles to edit. Blend combines components into an editable assembly.</p>
              {selectedComponent && !selectedComponent.detail && <p>{selectedComponent.name}: extracted model geometry. Its technical role has not been identified.</p>}
              {workbenchError && <p role="alert">{workbenchError}</p>}
            </div>}
            <p className="reality-parts-hint">Select a component to explore how it works.</p>
            {dissected && <p className="reality-parts-hint">Exploded concept illustration · Internal construction is illustrative.</p>}
            {!dissected && partsLoading && <p role="status">Loading part labels…</p>}
            {!dissected && partsError && <div role="alert"><p>{partsError}</p><Button variant="outline" onClick={() => setPartsAttempt(value => value + 1)}>RETRY LABELS</Button></div>}
            {selectedPart && (dissected || (!partsLoading && !partsError)) && <article id="reality-part-detail" className="reality-part-detail" aria-live="polite">
              <h2>{selectedPart.name}</h2>
              {dissected && dissection && <Button variant="outline" className="reality-edit-illustrated-part" onClick={editIllustratedPart}>MANIPULATE THIS PART IN 3D</Button>}
              <label className="reality-blend-choice">
                <input type="checkbox" checked={isPartSelected(selectedPart)} onChange={() => onTogglePart(selectedPart)} />
                Use {selectedPart.name} in a new blend
              </label>
              {!dissected && !componentId && <p>This feature is located on shared geometry. It is not yet a separate editable component.</p>}
              <dl>{([
                ["Purpose", selectedPart.purpose, "purpose"],
                ["Location in the design", selectedPart.location, "location"],
                ["How it works", selectedPart.operation, "operation"],
                ["Connections", selectedPart.connections, "connections"],
                ["Design limits", selectedPart.limitations, "limitations"],
              ] as const).map(([label, text, field]) => <div key={label}><dt>
                <label className="reality-blend-choice">
                  <input type="checkbox" checked={isPartSelected(selectedPart, field)}
                    onChange={() => onTogglePart(selectedPart, field)} aria-label={`Use ${selectedPart.name} ${label} in a new blend`} />
                  {label}
                </label>
              </dt><dd>{text}</dd></div>)}</dl>
            </article>}
          </section>
        )}
        {ready && !dissected && mode==="blueprint" && <div className="reality-mode-controls" aria-label="Blueprint camera views">{(["top","front","side","perspective"] as const).map(view=><Button variant="outline" key={view} onClick={()=>api.current?.view(view)}>{view==="perspective"?"3D":view.toUpperCase()}</Button>)}</div>}
        {ready && !dissected && <p>Drag to rotate · Right-drag to pan · Scroll / pinch to zoom</p>}
        <div className="reality-revision-actions" aria-label="Work from this result">
          <Button variant="outline" disabled={newObjectiveDisabled} onClick={onBuildOn}>BUILD ON RESULT</Button>
          <Button variant="outline" disabled={newObjectiveDisabled} onClick={onNewAnswers}>NEW ANSWERS</Button>
        </div>
        {blendControls}
      </footer>
      )}
    </dialog>,
    document.body,
  );
}
