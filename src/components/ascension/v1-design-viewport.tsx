import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  measuredPartOffsets, positionPartAtWorldOffset,
} from "@/lib/ascension/v1-model-transform.mjs";
import "./v1-design-viewport.css";

export type DesignView = "assembled" | "blueprint" | "dissect" | "exploded" | "imploded";

export function V1DesignViewport({
  modelUrl, imageUrl, blueprintUrl, mode, rotateRequest = 0, zoomRequest = 0,
}: { modelUrl: string | null; imageUrl: string | null; blueprintUrl: string | null; mode: DesignView;
  rotateRequest?: number; zoomRequest?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState("");
  const [dimensions, setDimensions] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const orbit = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null);
  const prevRotate = useRef(rotateRequest);
  const prevZoom = useRef(zoomRequest);

  useEffect(() => {
    const difference = rotateRequest - prevRotate.current;
    prevRotate.current = rotateRequest;
    if (!difference || !orbit.current) return;
    const { camera, controls } = orbit.current;
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0,1,0), -difference * Math.PI / 12);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }, [rotateRequest]);

  useEffect(() => {
    const difference = zoomRequest - prevZoom.current;
    prevZoom.current = zoomRequest;
    if (!difference) return;
    if (orbit.current) {
      const { camera, controls } = orbit.current;
      const offset = camera.position.clone().sub(controls.target);
      const factor = Math.pow(0.84, difference);
      const distance = Math.max(0.01, Math.min(10000, offset.length() * factor));
      camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(distance));
      controls.update();
    } else {
      setScale(value => Math.min(5, Math.max(1, value + 0.25 * difference)));
    }
  }, [zoomRequest]);

  useEffect(() => { setScale(1); }, [imageUrl, blueprintUrl, modelUrl, mode]);
  useEffect(() => {
    // Clear measurements from any prior selected model BEFORE this model loads.
    // Last model's bounds must never appear as the current invention's data.
    setDimensions(null);
    setProblem("");
    // A delivered blueprint is the authority for Blueprint view; do not
    // substitute wireframe geometry when the actual drawing is present.
    if (!modelUrl || (mode === "blueprint" && blueprintUrl) || !container.current) return;
    const host = container.current;
    let cancelled = false;
    let frame = 0;
    let implosionFrame = 0;
    let renderer: THREE.WebGLRenderer;
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
      orbit.current = {camera, controls};
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
      new GLTFLoader().load(modelUrl, loaded => {
        if (cancelled) return;
        geometry = loaded.scene;
        scene.add(geometry);
        const box = new THREE.Box3().setFromObject(geometry);
        if (box.isEmpty()) {
          setProblem("The delivered model contains no visible geometry.");
          return;
        }
        const extent = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const size = Math.max(extent.x, extent.y, extent.z, 0.01);
        if (!Number.isFinite(size)) {
          setProblem("The delivered model has invalid 3D bounds.");
          return;
        }
        setDimensions([extent.x, extent.y, extent.z].map(n => n.toFixed(3)).join(" × "));
        camera.position.set(center.x + size * 1.8, center.y + size * 0.9, center.z + size * 1.8);
        camera.near = Math.max(0.001, size / 1000);
        camera.far = Math.max(1000, size * 100);
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();
        const materialCopies: THREE.Material[] = [];
        const originals: {
          mesh: THREE.Mesh;
          material: THREE.Material | THREE.Material[];
          pos: THREE.Vector3;
        }[] = [];
        geometry.traverse(part => {
          if (!(part instanceof THREE.Mesh)) return;
          originals.push({
            mesh: part,
            material: part.material,
            pos: part.position.clone(),
          });
        });
        if (!originals.length) {
          setProblem("The delivered model contains no inspectable mesh components.");
          return;
        }
        if ((mode === "exploded" || mode === "imploded") && originals.length < 2) {
          setProblem("The delivered model has fewer than two separable mesh components.");
        } else setProblem("");
        // Inspect only existing, loaded mesh components. World-space offsets
        // must be converted to local coordinates for transformed GLB groups.
        const partOffsets = measuredPartOffsets(
          originals.map(part => part.mesh), center, size,
        );
        const clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), -center.x);
        for (let i = 0; i < originals.length; i++) {
          const { mesh, material, pos } = originals[i]!;
          if (mode === "exploded" && originals.length > 1) {
            positionPartAtWorldOffset(mesh, pos, partOffsets[i]!);
          }
          if (mode === "blueprint" || mode === "dissect") {
            const convert = (original: THREE.Material): THREE.Material => {
              const copy = original.clone();
              if (mode === "blueprint") {
                const draft = copy as THREE.MeshStandardMaterial;
                draft.wireframe = true;
                draft.color?.set("#bcdff5");
              } else {
                copy.clippingPlanes = [clip];
                copy.side = THREE.DoubleSide; // Keep true 3D cut surfaces visible.
              }
              materialCopies.push(copy);
              return copy;
            };
            mesh.material = Array.isArray(material) ? material.map(convert) : convert(material);
          }
        }
        replacements.push(...materialCopies);
        if (mode === "imploded" && originals.length > 1 &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const start = performance.now();
          const animateTogether = () => {
            if (cancelled) return;
            const k = Math.min(1, (performance.now() - start) / 1100);
            originals.forEach(({ mesh, pos }, i) => {
              positionPartAtWorldOffset(
                mesh, pos, partOffsets[i]!.clone().multiplyScalar(1 - k),
              );
            });
            if (k < 1) implosionFrame = window.requestAnimationFrame(animateTogether);
          };
          animateTogether();
        }
      }, undefined, () => { if (!cancelled) setProblem("ASCENSION could not load the delivered 3D model."); });
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
        window.cancelAnimationFrame(implosionFrame);
        observer.disconnect();
        controls.dispose();
        orbit.current = null;
        for (const material of replacements) material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        scene.clear();
      };
    } catch {
      setProblem("3D viewing is unavailable on this device.");
      return () => { cancelled = true; renderer?.dispose(); };
    }
  }, [modelUrl, blueprintUrl, mode]);

  if (!modelUrl || (mode === "blueprint" && blueprintUrl)) {
    // An ordinary concept picture is never a 3D Dissect/Explode/Implode.
    // Refuse a misleading flat illustration when the real GLB is missing.
    const requires3D = mode === "dissect" || mode === "exploded" || mode === "imploded";
    const displayedImage = !modelUrl && requires3D
      ? null : mode === "blueprint" ? blueprintUrl : imageUrl;
    return <div className="v1-design-image-view">
      {displayedImage ? <>
        <div className="v1-design-zoom-frame">
          <img src={displayedImage} alt={mode === "blueprint" ? "Delivered pathway blueprint" : "Selected pathway design"} draggable={false}
            style={{ transform: `scale(${scale})`, objectFit: "contain", width: "100%", height: "100%" }} />
        </div>
        <div className="v1-zoom-controls">
          <button type="button" aria-label="Zoom out" onClick={() => setScale(n => Math.max(1, n - 0.25))}>−</button>
          <button type="button" aria-label="Zoom in" onClick={() => setScale(n => Math.min(5, n + 0.25))}>+</button>
          <button type="button" onClick={() => setScale(1)}>Reset</button>
        </div>
        {mode !== "assembled" && !(mode === "blueprint" && blueprintUrl) && <p role="status">A true 3D model or actual measured drawing is required for this inspection. The original picture is preserved.</p>}
      </> : <p role="status">
        {requires3D
          ? "A delivered 3D model is required for " + mode + ". A flat image is not a 3D inspection."
          : mode === "blueprint"
            ? "No actual blueprint drawing or 3D wireframe has been delivered."
            : "The selected pathway has not delivered its design picture or 3D model."}
      </p>}
    </div>;
  }

  return <div className="v1-design-model">
    <div className="v1-model-canvas" ref={container} aria-label="Interactive selected 3D design; drag to rotate and scroll to zoom" />
    {dimensions && <p className="v1-model-measurement">3D model extents: {dimensions} model units. Physical dimensions are not verified.</p>}
    {problem && <p role="status">{problem}</p>}
  </div>;
}
