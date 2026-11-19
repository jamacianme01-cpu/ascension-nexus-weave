import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ObjectiveModelSpec } from "@/lib/ascension/result-model";

export type DesignView = "assembled" | "blueprint" | "dissect" | "exploded" | "imploded";

/** Construct inspectable geometry from THIS delivered pathway, not a stock image.
 * Coordinates are normalized model units; this is not a measured engineering drawing.
 */
function geometryFromSpec(spec: ObjectiveModelSpec): THREE.Group {
  const group = new THREE.Group();
  const colors: Record<string, number> = {
    gold: 0xd9ba65, gold_deep: 0x88632d, copper: 0xb87954,
    blue: 0x529dcc, blue_deep: 0x244a74, ice: 0xc4e9f1,
    cyan: 0x42c8d3, warm: 0xf2b88c, steel: 0x899ba9, dark: 0x2b3743,
  };
  for (const part of spec.parts) {
    let shape: THREE.BufferGeometry;
    switch (part.primitive) {
      case "cylinder": shape = new THREE.CylinderGeometry(0.5, 0.5, 1, 24); break;
      case "ring": shape = new THREE.TorusGeometry(0.7, 0.18, 12, 32); break;
      case "sphere": shape = new THREE.SphereGeometry(0.55, 24, 16); break;
      case "nozzle": shape = new THREE.CylinderGeometry(0.18, 0.48, 1, 24); break;
      default: shape = new THREE.BoxGeometry(1, 1, 1);
    }
    const mesh = new THREE.Mesh(shape, new THREE.MeshStandardMaterial({
      color: colors[part.material] ?? 0x899ba9, metalness: 0.38, roughness: 0.46,
      side: THREE.DoubleSide,
    }));
    mesh.name = part.name;
    mesh.position.set(...part.position);
    mesh.rotation.set(...part.rotation);
    mesh.scale.set(...part.scale);
    group.add(mesh);
  }
  group.rotation.set(...spec.hero_rotation);
  group.scale.setScalar(spec.hero_scale);
  return group;
}

export function V1DesignViewport({
  modelUrl, modelSpec, imageUrl, mode,
}: { modelUrl: string | null; modelSpec: ObjectiveModelSpec | null; imageUrl: string | null; mode: DesignView }) {
  const container = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState("");
  const [dimensions, setDimensions] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => { setScale(1); }, [imageUrl, modelUrl]);
  useEffect(() => {
    setDimensions(null);
    setProblem("");
    if ((!modelUrl && !modelSpec) || !container.current) return;
    const host = container.current;
    let cancelled = false;
    let frame = 0;
    let renderer!: THREE.WebGLRenderer;
    let controls: OrbitControls;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#081019");
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10000);
    scene.add(new THREE.HemisphereLight(0xe8eefc, 0x383d46, 2.3));
    const lamp = new THREE.DirectionalLight(0xffffff, 2.5);
    lamp.position.set(4, 8, 6);
    scene.add(lamp);
    let geometry: THREE.Group | null = null;
    const replacements: THREE.Material[] = [];
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.localClippingEnabled = true;
      host.appendChild(renderer.domElement);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = true;
      const resize = () => {
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      const install = (delivered: THREE.Group) => {
        if (cancelled) return;
        geometry = delivered;
        scene.add(geometry);
        const box = new THREE.Box3().setFromObject(geometry);
        if (box.isEmpty()) { setProblem("The delivered model contains no visible geometry."); return; }
        const extent = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const size = Math.max(extent.x, extent.y, extent.z, 0.01);
        setDimensions([extent.x, extent.y, extent.z].map(n => n.toFixed(3)).join(" × "));
        camera.position.set(center.x + size * 1.8, center.y + size * 0.9, center.z + size * 1.8);
        camera.near = Math.max(0.001, size / 1000);
        camera.far = Math.max(1000, size * 100);
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();
        const materialCopies: THREE.Material[] = [];
        const originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; pos: THREE.Vector3 }[] = [];
        geometry.traverse(part => {
          if (!(part instanceof THREE.Mesh)) return;
          const mesh = part;
          originals.push({ mesh, material: mesh.material, pos: mesh.position.clone() });
        });
        if ((mode === "exploded" || mode === "imploded") && originals.length < 2) {
          setProblem("The delivered model has fewer than two separable mesh components.");
        } else setProblem("");
        const clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), -center.x);
        for (const { mesh, material, pos } of originals) {
          if (mode === "exploded" && originals.length > 1) {
            const partCenter = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
            const away = partCenter.sub(center);
            if (away.lengthSq() < 0.0001) away.set(originals.indexOf(originals.find(a => a.mesh === mesh)!) % 2 ? 1 : -1, 0.2, 0);
            mesh.position.copy(pos).add(away.normalize().multiplyScalar(size * 0.25));
          }
          if (mode === "blueprint" || mode === "dissect") {
            const convert = (original: THREE.Material): THREE.Material => {
              const copy = original.clone();
              if (mode === "blueprint") {
                const draft = copy as THREE.MeshStandardMaterial;
                draft.wireframe = true;
                draft.color?.set("#bcdff5");
              } else copy.clippingPlanes = [clip];
              materialCopies.push(copy);
              return copy;
            };
            mesh.material = Array.isArray(material) ? material.map(convert) : convert(material);
          }
        }
        replacements.push(...materialCopies);
        if (mode === "imploded" && originals.length > 1) {
          const start = performance.now();
          const animateTogether = () => {
            if (cancelled) return;
            const k = Math.min(1, (performance.now() - start) / 1100);
            originals.forEach(({ mesh, pos }, i) => {
              const p = new THREE.Vector3((i % 3) - 1, Math.floor(i / 3) % 3 - 1, (i % 2) - 0.5)
                .normalize().multiplyScalar(size * 0.3 * (1 - k));
              mesh.position.copy(pos).add(p);
            });
            if (k < 1) window.requestAnimationFrame(animateTogether);
          };
          animateTogether();
        }
      };
      if (modelUrl) {
        new GLTFLoader().load(modelUrl, loaded => install(loaded.scene), undefined, () => {
          if (cancelled) return;
          if (modelSpec) {
            install(geometryFromSpec(modelSpec));
            setProblem("The delivered GLB is unavailable; showing only this pathway's conceptual geometry. Physical measurements are not verified.");
          } else {
            setProblem("ASCENSION could not load the delivered 3D model.");
          }
        });
      } else if (modelSpec) {
        install(geometryFromSpec(modelSpec));
      }
      const render = () => {
        if (cancelled) return;
        controls.update();
        renderer.render(scene, camera);
        frame = window.requestAnimationFrame(render);
      };
      render();
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        for (const material of replacements) material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        if (!modelUrl) scene.traverse(part => {
          if (part instanceof THREE.Mesh) {
            part.geometry.dispose();
            if (Array.isArray(part.material)) part.material.forEach(material => material.dispose());
            else part.material.dispose();
          }
        });
        scene.clear();
      };
    } catch {
      setProblem("3D viewing is unavailable on this device.");
      return () => { cancelled = true; renderer?.dispose(); renderer?.domElement.remove(); };
    }
  }, [modelUrl, modelSpec, mode]);

  if (!modelUrl && !modelSpec) {
    return <div className="v1-design-image-view">
      {imageUrl ? <>
        <div className="v1-design-zoom-frame">
          <img src={imageUrl} alt="Selected pathway design" draggable={false}
            style={{ transform: `scale(${scale})`, objectFit: "contain", width: "100%", height: "100%" }} />
        </div>
        <div className="v1-zoom-controls">
          <button type="button" aria-label="Zoom out" onClick={() => setScale(n => Math.max(1, n - 0.25))}>−</button>
          <button type="button" aria-label="Zoom in" onClick={() => setScale(n => Math.min(5, n + 0.25))}>+</button>
          <button type="button" onClick={() => setScale(1)}>Reset</button>
        </div>
        {mode !== "assembled" && <p role="status">This view needs the matching 3D model or measured drawing. The original design picture is preserved.</p>}
      </> : <p role="status">The selected pathway has not delivered its design picture or 3D model.</p>}
    </div>;
  }

  return <div className="v1-design-model">
    <div className="v1-model-canvas" ref={container} aria-label="Interactive selected 3D design; drag to rotate and scroll to zoom" />
    {dimensions && <p className="v1-model-measurement">3D geometry extents: {dimensions} model units. Physical dimensions are not verified.</p>}
    {problem && <p role="status">{problem}</p>}
  </div>;
}
