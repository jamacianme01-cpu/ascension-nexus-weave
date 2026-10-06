import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { ObjectivePathway } from "@/lib/ascension/result-model";
import "./reality-viewer.css";

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
  demo: (enabled: boolean) => void;
};

/** Dedicated inspection screen. Every displayed object comes from the selected GLB. */
export function RealityViewer({
  pathway,
  initialMode,
  onClose,
  soundEnabled,
  onToggleSound,
  onDive,
}: {
  pathway: ObjectivePathway;
  initialMode: RealityMode;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onDive: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ViewerControls | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [arrived, setArrived] = useState(false);
  const dive = useRef(onDive);
  dive.current = onDive;
  const [mode, setMode] = useState<RealityMode>(
    initialMode === "cutaway" ? "blueprint" : initialMode,
  );
  const [selectedObject, setSelectedObject] = useState("Nothing selected");
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
  const [addKind, setAddKind] = useState<CatalogKind>("box");
  const [objectColor, setObjectColor] = useState("#6ed7ff");
  const [backgroundColor, setBackgroundColor] = useState("daylight");
  const [demoActive, setDemoActive] = useState(false);
  const [demoEvent, setDemoEvent] = useState("Ready for a live demonstration");
  const [space, setSpace] = useState<RoomName>("Workspace");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState(100);
  const [exploring, setExploring] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    setArrived(false);
    setMode(initialMode === "cutaway" ? "blueprint" : initialMode);
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
  }, [ready]);

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
    renderer.domElement.setAttribute("aria-label", "Reality model: drag to rotate, scroll to zoom");
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
      setSelectedObject(String(object.userData["ascensionName"] ?? object.name ?? "Object"));
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
        blueprintMaterials.set(node, Array.isArray(node.material) ? blue : blue[0]);
      });
      setObjectColor(value);
    };
    const addObject = (kind: CatalogKind) => {
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
      const part = (geometry: THREE.BufferGeometry, position: THREE.Vector3, material = finish) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      };
      if (kind === "sphere") part(new THREE.SphereGeometry(0.65, 32, 20), new THREE.Vector3());
      else if (kind === "cylinder")
        part(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 32), new THREE.Vector3());
      else if (kind === "box") part(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.Vector3());
      else if (kind === "panel") part(new THREE.BoxGeometry(3.2, 0.16, 2.2), new THREE.Vector3());
      else if (kind === "beam") part(new THREE.BoxGeometry(5.5, 0.35, 0.35), new THREE.Vector3());
      else if (kind === "column")
        part(new THREE.CylinderGeometry(0.42, 0.48, 4.2, 24), new THREE.Vector3(0, 2.1, 0));
      else if (kind === "wheel")
        part(new THREE.TorusGeometry(0.85, 0.2, 18, 36), new THREE.Vector3(), accent);
      else if (kind === "gear") {
        part(new THREE.CylinderGeometry(0.82, 0.82, 0.24, 16), new THREE.Vector3(), accent);
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
        part(new THREE.TorusGeometry(0.68, 0.12, 16, 36), new THREE.Vector3(), accent);
        part(new THREE.TorusGeometry(0.68, 0.12, 16, 36), new THREE.Vector3(0, 0.34, 0), accent);
        part(new THREE.TorusGeometry(0.68, 0.12, 16, 36), new THREE.Vector3(0, -0.34, 0), accent);
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
        part(new THREE.BoxGeometry(1.5, 2.2, 1.1), new THREE.Vector3(0, 1.1, 0));
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
        part(new THREE.BoxGeometry(6, 0.18, 0.22), new THREE.Vector3(0, 0.2, -0.65));
        part(new THREE.BoxGeometry(6, 0.18, 0.22), new THREE.Vector3(0, 0.2, 0.65), accent);
        for (let i = -2; i <= 2; i++)
          part(new THREE.BoxGeometry(0.18, 0.2, 1.6), new THREE.Vector3(i, 0.2, 0), finish);
      } else if (kind === "sensor") {
        part(new THREE.CylinderGeometry(0.3, 0.42, 0.7, 24), new THREE.Vector3(0, 0.35, 0), accent);
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
        part(new THREE.BoxGeometry(4.5, 0.28, 2), new THREE.Vector3(0, 1.45, 0));
        [-1.9, 1.9].forEach((x) =>
          [-0.7, 0.7].forEach((z) =>
            part(new THREE.BoxGeometry(0.22, 1.45, 0.22), new THREE.Vector3(x, 0.7, z)),
          ),
        );
        part(new THREE.BoxGeometry(1.7, 1.05, 0.12), new THREE.Vector3(0, 2.08, -0.55), accent);
      } else if (kind === "chair") {
        part(new THREE.BoxGeometry(1.6, 0.22, 1.5), new THREE.Vector3(0, 0.85, 0));
        part(new THREE.BoxGeometry(1.6, 1.8, 0.2), new THREE.Vector3(0, 1.7, -0.62), accent);
        [-0.55, 0.55].forEach((x) =>
          [-0.5, 0.5].forEach((z) =>
            part(new THREE.BoxGeometry(0.14, 0.85, 0.14), new THREE.Vector3(x, 0.4, z)),
          ),
        );
      } else if (kind === "sofa") {
        part(new THREE.BoxGeometry(4.5, 1.1, 1.8), new THREE.Vector3(0, 0.65, 0));
        part(new THREE.BoxGeometry(4.5, 1.45, 0.28), new THREE.Vector3(0, 1.65, -0.75), accent);
        [-2.1, 2.1].forEach((x) =>
          part(new THREE.BoxGeometry(0.3, 1.4, 1.8), new THREE.Vector3(x, 1.1, 0), accent),
        );
      } else if (kind === "table") {
        part(new THREE.CylinderGeometry(1.5, 1.5, 0.22, 40), new THREE.Vector3(0, 1.35, 0));
        part(
          new THREE.CylinderGeometry(0.18, 0.28, 1.35, 24),
          new THREE.Vector3(0, 0.65, 0),
          accent,
        );
      } else if (kind === "cabinet") {
        part(new THREE.BoxGeometry(2.8, 3.2, 0.55), new THREE.Vector3(0, 1.6, 0));
        [-0.68, 0.68].forEach((x) =>
          part(new THREE.BoxGeometry(1.28, 2.8, 0.08), new THREE.Vector3(x, 1.6, -0.32), accent),
        );
      } else if (kind === "wall") {
        part(new THREE.BoxGeometry(6, 4, 0.22), new THREE.Vector3(0, 2, 0));
      } else if (kind === "door") {
        part(new THREE.BoxGeometry(2.2, 4.6, 0.18), new THREE.Vector3(0, 2.3, 0));
        part(new THREE.SphereGeometry(0.12, 18, 12), new THREE.Vector3(0.72, 2.2, -0.18), accent);
      } else if (kind === "window") {
        part(new THREE.BoxGeometry(4.2, 2.6, 0.12), new THREE.Vector3(0, 2.2, 0), accent);
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
        part(new THREE.BoxGeometry(0.12, 2.4, 0.16), new THREE.Vector3(0, 2.2, -0.18), finish);
        part(new THREE.BoxGeometry(4, 0.12, 0.16), new THREE.Vector3(0, 2.2, -0.18), finish);
      } else if (kind === "tub") {
        part(new THREE.BoxGeometry(4.2, 0.9, 2.2), new THREE.Vector3(0, 0.5, 0), accent);
        part(
          new THREE.BoxGeometry(3.4, 0.12, 1.5),
          new THREE.Vector3(0, 0.98, 0),
          new THREE.MeshStandardMaterial({ color: 0xbdebed, roughness: 0.16, metalness: 0.22 }),
        );
      } else if (kind === "sink") {
        part(new THREE.BoxGeometry(2.3, 1.5, 1.2), new THREE.Vector3(0, 0.75, 0));
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
        part(new THREE.CylinderGeometry(0.7, 0.35, 0.3, 32), new THREE.Vector3(0, 2.8, 0), accent);
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
      addedObjects.add(group);
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
          },
        );
        blueprintMaterials.set(node, Array.isArray(node.material) ? nodeBlue : nodeBlue[0]);
        sourceBlueprintMaterials.set(node, Array.isArray(node.material) ? nodeBlue : nodeBlue[0]);
      });
      scene.add(group);
      setSelected(group);
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
          (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) =>
            m.dispose(),
          );
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
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) =>
          material.dispose(),
        );
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
      roomMesh(new THREE.BoxGeometry(24, 9, 0.18), wall, new THREE.Vector3(0, y + 4.5, -9));
      roomMesh(new THREE.BoxGeometry(0.18, 9, 18), wall, new THREE.Vector3(-12, y + 4.5, 0));
      roomMesh(new THREE.BoxGeometry(0.18, 9, 18), wall.clone(), new THREE.Vector3(12, y + 4.5, 0));
      roomMesh(
        new THREE.BoxGeometry(24, 0.18, 18),
        new THREE.MeshStandardMaterial({ color: 0x24333c, roughness: 0.9 }),
        new THREE.Vector3(0, y + 9, 0),
      );
      if (name === "Workspace") {
        roomMesh(new THREE.BoxGeometry(8, 0.35, 3), trim, new THREE.Vector3(-1, y + 2.2, -2));
        roomMesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), trim, new THREE.Vector3(-4, y + 1.1, -3));
        roomMesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), trim, new THREE.Vector3(2, y + 1.1, -3));
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
        roomMesh(new THREE.BoxGeometry(7, 1.7, 0.35), trim, new THREE.Vector3(-1, y + 2.05, -4));
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
        roomMesh(new THREE.BoxGeometry(7, 1.35, 0.35), trim, new THREE.Vector3(-1, y + 1.5, -5.5));
        roomMesh(new THREE.BoxGeometry(2.3, 2.6, 0.55), trim, new THREE.Vector3(5, y + 1.3, -4));
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
        roomMesh(new THREE.BoxGeometry(9, 1.6, 1.3), trim, new THREE.Vector3(-2, y + 0.8, -5.5));
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
          new THREE.MeshStandardMaterial({ color: 0xb9d8d4, metalness: 0.6, roughness: 0.18 }),
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
        roomMesh(new THREE.BoxGeometry(8, 1.4, 1.5), trim, new THREE.Vector3(-2, y + 0.7, -5.5));
        roomMesh(
          new THREE.BoxGeometry(6.2, 0.35, 3.4),
          new THREE.MeshStandardMaterial({ color: 0x6a7075, roughness: 0.7, metalness: 0.2 }),
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
        roomMesh(new THREE.BoxGeometry(4, 1.5, 0.8), trim, new THREE.Vector3(4, y + 0.75, -3));
        roomMesh(
          new THREE.BoxGeometry(4.2, 3.2, 0.12),
          new THREE.MeshStandardMaterial({ color: 0xc4e9ed, metalness: 0.6, roughness: 0.18 }),
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
      { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }
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
    buildRoom("Workspace");
    let demoObject: THREE.Mesh | null = null;
    let demoActiveRef = false;
    let demoElapsed = 0;
    let demoPhase = "";
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
    };
    const fit = () => {
      const radius = bounds.length() / 2;
      const angle = Math.min(
        THREE.MathUtils.degToRad(perspective.fov / 2),
        Math.atan((Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) * width) / height),
      );
      const distance = (radius / Math.sin(angle)) * 1.07;
      camera.position
        .copy(center)
        .add(new THREE.Vector3(0.8, 0.5, 1).normalize().multiplyScalar(distance));
      camera.up.set(0, 1, 0);
      orthographic.zoom =
        Math.min(14 / Math.max(bounds.y, bounds.z), (14 * width) / height / bounds.x) * 0.75;
      orthographic.updateProjectionMatrix();
      orbit.target.copy(center);
      camera.lookAt(center);
      orbit.update();
    };
    const applyBackground = (preset: string) => {
      const presets: Record<string, { color: number; light: number }> = {
        daylight: { color: 0x8fb9c8, light: 3.4 },
        dusk: { color: 0x3a3f66, light: 2.1 },
        night: { color: 0x0b1426, light: 1.1 },
        blueprint: { color: 0x071e38, light: 2.7 },
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
      roomEnvironment.visible = next === "environment";
      grid.visible = next === "blueprint";
      lines.visible = next === "blueprint";
      transform.getHelper().visible = next !== "environment" || selected !== null;
      applyBackground(backgroundColor);
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
    const controls: ViewerControls = {
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
        camera.up.copy(view === "top" ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0));
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
      demo(enabled) {
        demoActiveRef = enabled;
        setDemoActive(enabled);
        if (enabled) {
          applyMode("environment");
          setReactMode("environment");
          buildRoom(space);
          if (!demoObject) {
            demoObject = new THREE.Mesh(
              new THREE.IcosahedronGeometry(0.7, 2),
              new THREE.MeshStandardMaterial({
                color: 0xffc65b,
                emissive: 0x5f2d04,
                emissiveIntensity: 0.8,
                roughness: 0.28,
                metalness: 0.35,
              }),
            );
            demoObject.userData["ascensionName"] = "Live demo object";
            demoObject.position.set(0, (floor.position.y || -3) + 1.15, 1);
            demoObject.castShadow = true;
            scene.add(demoObject);
          }
          demoElapsed = 0;
          demoPhase = "";
        } else if (demoObject) {
          scene.remove(demoObject);
          demoObject.geometry.dispose();
          (demoObject.material as THREE.Material).dispose();
          demoObject = null;
          setDemoEvent("Live demonstration stopped");
        }
      },
      reset() {
        const startingMode = initialMode === "cutaway" ? "blueprint" : initialMode;
        demoActiveRef = false;
        if (demoObject) {
          scene.remove(demoObject);
          demoObject.geometry.dispose();
          (demoObject.material as THREE.Material).dispose();
          demoObject = null;
        }
        setSelected(null);
        for (const object of [...addedObjects]) {
          object.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            node.geometry.dispose();
            (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) =>
              material.dispose(),
            );
            materials.delete(node);
            sourceMaterials.delete(node);
            blueprintMaterials.delete(node);
            sourceBlueprintMaterials.delete(node);
          });
          object.parent?.remove(object);
          editable.delete(object);
        }
        addedObjects.clear();
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
        setDemoActive(false);
        setDemoEvent("Ready for a live demonstration");
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
        !["w", "a", "s", "d", "q", "e", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          event.key,
        )
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
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      euler.y -= (event.clientX - look.x) * 0.004;
      euler.x = THREE.MathUtils.clamp(euler.x - (event.clientY - look.y) * 0.004, -1.5, 1.5);
      camera.quaternion.setFromEuler(euler);
      look.x = event.clientX;
      look.y = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => {
      if (!fly && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 7) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects([...editable], true);
        const hit = hits[0]?.object ?? null;
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
      if (demoActiveRef && demoObject) {
        demoElapsed += dt;
        const phase =
          demoElapsed < 2.2
            ? "Reading request · selecting the workspace"
            : demoElapsed < 4.4
              ? "Generating layout · placing objects in the room"
              : demoElapsed < 6.6
                ? "Applying materials, color, and lighting"
                : "Saving the live environment arrangement";
        if (phase !== demoPhase) {
          demoPhase = phase;
          setDemoEvent(phase);
        }
        const t = demoElapsed % 8;
        demoObject.position.x = Math.sin((t * Math.PI) / 4) * 3.2;
        demoObject.position.z = Math.cos((t * Math.PI) / 4) * 1.8;
        demoObject.rotation.x += dt * 0.7;
        demoObject.rotation.y += dt * 1.1;
        const mat = demoObject.material as THREE.MeshStandardMaterial;
        mat.color.set(new THREE.Color().setHSL((t / 8 + 0.08) % 1, 0.72, 0.58));
        if (t > 7.8) setDemoEvent("Selecting an object");
      }
      renderer.render(scene, camera);
    });
    if (!pathway.model_url) {
      setMode(modeRef.current);
      setReady(true);
    } else
      void (async () => {
        try {
          const response = await fetch(pathway.model_url!, { signal: controller.signal });
          if (!response.ok) throw new Error(`Model download returned HTTP ${response.status}`);
          const gltf = await new GLTFLoader().parseAsync(
            await response.arrayBuffer(),
            new URL(".", pathway.model_url!).href,
          );
          if (disposed) {
            disposeModel(gltf.scene);
            return;
          }
          model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          if (box.isEmpty()) throw new Error("This model contains no visible geometry.");
          const rawSize = box.getSize(new THREE.Vector3());
          const scale = 10 / Math.max(rawSize.x, rawSize.y, rawSize.z);
          model.scale.multiplyScalar(scale);
          model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scale));
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
            for (const material of [node.material].flat()) material.side = THREE.DoubleSide;
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
                  clone.color.set("#6bbbd7");
                if ("roughness" in clone) clone.roughness = 0.4;
                if ("metalness" in clone) clone.metalness = 0.18;
                return clone;
              },
            );
            blueprintMaterials.set(node, Array.isArray(node.material) ? nodeBlue : nodeBlue[0]);
            sourceBlueprintMaterials.set(
              node,
              Array.isArray(node.material) ? nodeBlue : nodeBlue[0],
            );
            editable.add(node);
            const edge = new THREE.LineSegments(
              new THREE.EdgesGeometry(node.geometry, 12),
              edgeMaterial,
            );
            edge.applyMatrix4(node.matrixWorld);
            lines.add(edge);
          });
          floor.position.y = normalized.min.y - 0.03;
          grid.position.y = normalized.min.y - 0.04;
          buildRoom(space);
          scene.add(model);
          setMode(modeRef.current);
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
      observer.disconnect();
      orbit.dispose();
      transform.dispose();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      if (model) disposeModel(model);
      disposeRoom();
      if (demoObject) {
        demoObject.geometry.dispose();
        (demoObject.material as THREE.Material).dispose();
      }
      lines.children.forEach((node) => {
        if (node instanceof THREE.LineSegments) node.geometry.dispose();
      });
      blueprintMaterials.forEach((material) => {
        for (const item of [material].flat()) item.dispose();
      });
      blueprintMaterial.dispose();
      edgeMaterial.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      grid.geometry.dispose();
      for (const material of [grid.material].flat()) material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [pathway.id, pathway.model_url, attempt]);

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
        <button className="reality-back" onClick={onClose}>
          ← BACK TO PATHWAYS
        </button>
        <div className="reality-title">
          <span>ASCENSION / ENVISION</span>
          <h1>{pathway.label}</h1>
        </div>
        <button className="reality-sound" aria-pressed={soundEnabled} onClick={onToggleSound}>
          {soundEnabled ? "SOUND ON" : "SOUND OFF"}
        </button>
        <nav aria-label="Reality view" className="reality-tabs">
          {(["cutaway", "blueprint", "environment"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                api.current?.mode(value);
                if (value === "environment") api.current?.space(space);
              }}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </nav>
      </header>
      <div ref={host} className="reality-viewport" data-ready={ready} />
      {!ready && (
        <div className="reality-status" role={error ? "alert" : "status"}>
          <p>
            {error ??
              (!pathway.model_url
                ? (pathway.model_error ?? `3D ${pathway.model_status ?? "not available"}`)
                : "Loading your model…")}
          </p>
          {error && <button onClick={() => setAttempt((value) => value + 1)}>RETRY LOAD</button>}
        </div>
      )}
      <aside className="reality-tools" aria-label="Model controls">
        <button disabled={!ready} aria-label="Zoom in" onClick={() => api.current?.zoom(1.3)}>
          ＋
        </button>
        <button disabled={!ready} aria-label="Zoom out" onClick={() => api.current?.zoom(1 / 1.3)}>
          −
        </button>
        <button
          disabled={!ready}
          onClick={() => {
            setExploring(false);
            api.current?.explore(false);
            api.current?.fit();
          }}
        >
          FIT MODEL
        </button>
        <button disabled={!ready} onClick={() => api.current?.reset()}>
          RESET REALITY
        </button>
      </aside>
      <footer className="reality-footer">
        <div className="reality-edit-panel" aria-label="Reality manipulation tools">
          <span className="reality-selection">{selectedObject}</span>
          <div className="reality-edit-buttons">
            {(["translate", "rotate", "scale"] as const).map((value) => (
              <button
                key={value}
                disabled={!ready || selectedObject === "Nothing selected"}
                aria-pressed={transformMode === value}
                onClick={() => api.current?.transform(value)}
              >
                {value === "translate" ? "MOVE" : value.toUpperCase()}
              </button>
            ))}
            <select
              aria-label="Add object"
              value={addKind}
              onChange={(event) => setAddKind(event.target.value as typeof addKind)}
            >
              <optgroup label="CORE CAD">
                <option value="box">Box</option>
                <option value="sphere">Sphere</option>
                <option value="cylinder">Cylinder</option>
                <option value="panel">Panel</option>
                <option value="beam">Beam</option>
                <option value="column">Column</option>
              </optgroup>
              <optgroup label="FURNITURE">
                <option value="desk">Desk</option>
                <option value="chair">Chair</option>
                <option value="sofa">Sofa</option>
                <option value="table">Table</option>
                <option value="cabinet">Cabinet</option>
              </optgroup>
              <optgroup label="ARCHITECTURE">
                <option value="wall">Wall</option>
                <option value="door">Door</option>
                <option value="window">Window</option>
                <option value="tub">Tub</option>
                <option value="sink">Sink</option>
                <option value="light">Light</option>
              </optgroup>
              <optgroup label="MECHANICAL">
                <option value="wheel">Wheel</option>
                <option value="gear">Gear</option>
                <option value="pipe">Pipe</option>
                <option value="coil">Coil</option>
                <option value="motor">Motor</option>
              </optgroup>
              <optgroup label="ELECTRICAL & INVENTION">
                <option value="battery">Battery</option>
                <option value="prism">Prism</option>
                <option value="rail">Rail Assembly</option>
                <option value="sensor">Sensor</option>
              </optgroup>{" "}
            </select>
            <button disabled={!ready} onClick={() => api.current?.add(addKind)}>
              ADD
            </button>
            <button
              disabled={!ready || selectedObject === "Nothing selected"}
              onClick={() => api.current?.remove()}
            >
              DELETE
            </button>
            <label className="reality-color">
              <span>COLOR</span>
              <input
                disabled={!ready || selectedObject === "Nothing selected"}
                type="color"
                value={objectColor}
                onChange={(event) => {
                  setObjectColor(event.target.value);
                  api.current?.color(event.target.value);
                }}
              />
            </label>
          </div>
        </div>
        <div className="reality-live-demo" aria-live="polite">
          <div className="reality-demo-copy">
            <div className="reality-demo-heading">
              <span className="live-dot" /> <strong>REAL-TIME DEMO</strong>
            </div>
            <span className="reality-demo-request">
              REQUEST: “Create a working invention workspace with a desk, power rail, and sensor.”
            </span>
            <span className="reality-demo-event">{demoEvent}</span>
          </div>
          <button
            disabled={!ready}
            aria-pressed={demoActive}
            onClick={() => api.current?.demo(!demoActive)}
          >
            {demoActive ? "STOP LIVE DEMO" : "RUN LIVE DEMO"}
          </button>
        </div>
        <div className="reality-mode-controls">
          {mode === "blueprint" &&
            (["top", "front", "side", "perspective"] as const).map((view) => (
              <button disabled={!ready} key={view} onClick={() => api.current?.view(view)}>
                {view === "perspective" ? "3D" : view.toUpperCase()}
              </button>
            ))}
          {mode === "cutaway" && (
            <label>
              SECTION{" "}
              <input
                disabled={!ready}
                aria-label="Cutaway section"
                type="range"
                min="0"
                max="100"
                value={section}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSection(value);
                  api.current?.section(value);
                }}
              />
              <span>{section === 100 ? "FULL MODEL" : `${section}%`}</span>
            </label>
          )}
          {mode === "environment" && (
            <div className="reality-spaces" aria-label="Living spaces">
              <span className="reality-space-label">ROOM ENVIRONMENTS</span>
              {ROOM_OPTIONS.map((value) => (
                <button
                  key={value}
                  aria-pressed={space === value}
                  disabled={!ready}
                  onClick={() => {
                    setSpace(value);
                    setExploring(true);
                    api.current?.space(value);
                    api.current?.explore(true);
                  }}
                >
                  {value}
                </button>
              ))}
              <button
                disabled={!ready}
                aria-pressed={exploring}
                onClick={() => {
                  setExploring(!exploring);
                  api.current?.explore(!exploring);
                }}
              >
                {exploring ? "RETURN TO ORBIT" : "EXPLORE INSIDE"}
              </button>
            </div>
          )}
          {exploring && (
            <div className="reality-movement" aria-label="Move through environment">
              {[
                ["w", "FORWARD"],
                ["s", "BACK"],
                ["a", "LEFT"],
                ["d", "RIGHT"],
                ["e", "UP"],
                ["q", "DOWN"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    api.current?.move(key!, true);
                  }}
                  onPointerUp={() => api.current?.move(key!, false)}
                  onPointerCancel={() => api.current?.move(key!, false)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <p>
          {exploring
            ? "Drag to look · WASD to move · Q / E down / up"
            : mode === "blueprint"
              ? "Orthographic drawing · Drag to rotate · Right-drag to pan · Scroll / pinch to zoom"
              : "Drag to rotate · Right-drag to pan · Scroll / pinch to zoom"}
        </p>
      </footer>
    </dialog>,
    document.body,
  );
}
