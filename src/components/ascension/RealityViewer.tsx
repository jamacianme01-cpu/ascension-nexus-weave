import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ObjectivePathway } from "@/lib/ascension/result-model";
import "./reality-viewer.css";

export type RealityMode = "cutaway" | "blueprint" | "environment";
type View = "perspective" | "top" | "front" | "side";
type ViewerControls = {
  mode: (mode: RealityMode) => void;
  fit: () => void;
  zoom: (factor: number) => void;
  view: (view: View) => void;
  section: (value: number) => void;
  explore: (enabled: boolean) => void;
  move: (direction: string, down: boolean) => void;
};

/** Dedicated inspection screen. Every displayed object comes from the selected GLB. */
export function RealityViewer({
  pathway,
  initialMode,
  onClose,
}: {
  pathway: ObjectivePathway;
  initialMode: RealityMode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ViewerControls | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [mode, setMode] = useState<RealityMode>(initialMode);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState(100);
  const [exploring, setExploring] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;

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
    if (!target || !pathway.model_url) return;
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
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "Reality model: drag to rotate, scroll to zoom");
    target.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const perspective = new THREE.PerspectiveCamera(45, 1, 0.01, 300);
    const orthographic = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.01, 300);
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective;
    let orbit: OrbitControls<THREE.PerspectiveCamera | THREE.OrthographicCamera> =
      new OrbitControls(camera, renderer.domElement);
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
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x85b9ff, 1.4);
    fill.position.set(-8, 3, -6);
    scene.add(fill);
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
    const lines = new THREE.Group();
    scene.add(lines);
    const materials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const blueprintMaterial = new THREE.MeshBasicMaterial({
      color: 0x153f6d,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      side: THREE.DoubleSide,
    });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xb8e6ff });
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
    const bounds = new THREE.Vector3(10, 6, 6);
    const center = new THREE.Vector3();
    let activeMode: RealityMode = modeRef.current;
    let fly = false;
    let width = 1,
      height = 1;
    const keys = new Set<string>();
    const look = { active: false, x: 0, y: 0 };
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
    const setMode = (next: RealityMode) => {
      activeMode = next;
      fly = false;
      keys.clear();
      orbit.dispose();
      camera = next === "blueprint" ? orthographic : perspective;
      orbit = new OrbitControls(camera, renderer.domElement);
      configureOrbit();
      floor.visible = next === "environment";
      grid.visible = next === "blueprint";
      lines.visible = next === "blueprint";
      scene.background = new THREE.Color(
        next === "blueprint" ? 0x071e38 : next === "environment" ? 0xbdced7 : 0x10181f,
      );
      scene.fog = next === "environment" ? new THREE.Fog(0xbdced7, 45, 150) : null;
      for (const [mesh, original] of materials)
        mesh.material = next === "blueprint" ? blueprintMaterial : original;
      plane.constant = 100;
      renderer.clippingPlanes = [];
      fit();
    };
    const controls: ViewerControls = {
      mode: setMode,
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
            ? new THREE.Vector3(0, 1, 0.0001)
            : view === "front"
              ? new THREE.Vector3(0, 0, 1)
              : view === "side"
                ? new THREE.Vector3(1, 0, 0)
                : new THREE.Vector3(0.8, 0.5, 1).normalize();
        const distance = Math.max(8, camera.position.distanceTo(orbit.target));
        camera.position.copy(center).addScaledVector(direction, distance);
        camera.up.set(0, 1, 0);
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
    };
    api.current = controls;
    resize();
    setMode(activeMode);
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
    const pointerUp = () => {
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
      renderer.render(scene, camera);
    });
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
        model.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          for (const material of [node.material].flat()) material.side = THREE.DoubleSide;
          materials.set(node, node.material);
          const edge = new THREE.LineSegments(
            new THREE.EdgesGeometry(node.geometry, 24),
            edgeMaterial,
          );
          edge.applyMatrix4(node.matrixWorld);
          lines.add(edge);
        });
        floor.position.y = normalized.min.y - 0.03;
        grid.position.y = normalized.min.y - 0.04;
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
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      if (model) disposeModel(model);
      lines.children.forEach((node) => {
        if (node instanceof THREE.LineSegments) node.geometry.dispose();
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
  }, [pathway.model_url, attempt]);

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
      aria-label={`${pathway.label} — immersive reality`}
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
    >
      <header className="reality-header">
        <button className="reality-back" onClick={onClose}>
          ← BACK TO PATHWAYS
        </button>
        <div className="reality-title">
          <span>ASCENSION / ENVISION</span>
          <h1>{pathway.label}</h1>
        </div>
        <nav aria-label="Reality view" className="reality-tabs">
          {(["cutaway", "blueprint", "environment"] as const).map((value) => (
            <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
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
      </aside>
      <footer className="reality-footer">
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
