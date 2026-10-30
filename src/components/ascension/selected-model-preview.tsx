import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ObjectivePathway, ObjectiveModelSpec } from "@/lib/ascension/result-model";
import { buildCanonicalAssembly } from "@/lib/ascension/canonical-assembly";

/**
 * Interactive path-specific concept rendering, NOT a fabricated photograph or
 * dimensioned engineering blueprint. Created only when the user selects one
 * of the four paths. Uses the exact selected-path geometry specification.
 */
export function SelectedModelPreview({ objective, pathway, spec }: {
  objective: string;
  pathway: ObjectivePathway;
  spec: ObjectiveModelSpec;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<{ zoom(factor: number): void; reset(): void } | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x081827);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.03, 1000);
    const assembly = buildCanonicalAssembly(objective, pathway);
    if (!assembly.children.length) {
      setProblem("This pathway has no usable geometry.");
      return;
    }
    scene.add(assembly);
    scene.add(new THREE.AmbientLight(0xe0edff, 1.5));
    const key = new THREE.DirectionalLight(0xfbf1df, 3.2);
    key.position.set(4, 7, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x70c7fb, 1.8);
    fill.position.set(-5, 1, -4);
    scene.add(fill);
    const bounds = new THREE.Box3().setFromObject(assembly);
    const center = bounds.getCenter(new THREE.Vector3());
    const diameter = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1.8);
    const resetCamera = () => {
      camera.position.copy(center).add(new THREE.Vector3(diameter * 1.05, diameter * .56, diameter * 1.45));
      camera.lookAt(center);
      controls?.target.copy(center);
      controls?.update();
    };
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      element.appendChild(renderer.domElement);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = .08;
      controls.enablePan = true;
      controls.minDistance = .25;
      controls.maxDistance = 50;
      resetCamera();
      const resize = () => {
        if (!renderer) return;
        const width = Math.max(1, element.clientWidth);
        const height = Math.max(1, element.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      };
      observer = new ResizeObserver(resize);
      observer.observe(element);
      resize();
      const draw = () => {
        controls?.update();
        renderer?.render(scene, camera);
        frame = requestAnimationFrame(draw);
      };
      draw();
      view.current = {
        zoom(factor) {
          camera.position.sub(center).multiplyScalar(factor).add(center);
          controls?.update();
        },
        reset: resetCamera,
      };
    } catch (cause) {
      setProblem("3D graphics are not available in this browser.");
    }
    return () => {
      view.current = null;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      controls?.dispose();
      renderer?.dispose();
      if (renderer?.domElement.parentNode === element) element.removeChild(renderer.domElement);
      assembly.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose());
        else mesh.material.dispose();
      });
    };
  }, [objective, spec]);

  return <div className="space-y-3" aria-label={"Interactive concept view of " + pathway.label}>
    <div ref={host} className="h-[320px] w-full overflow-hidden rounded-lg bg-[#081827] sm:h-[500px]"
      role="img" aria-label={"Rotatable 3D concept model of " + pathway.label} />
    {problem ? <p role="alert" className="text-sm text-red-200">{problem}</p> : <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => view.current?.zoom(.8)}
          className="rounded-full border border-gold/45 px-4 py-2 text-xs text-gold">ZOOM IN</button>
        <button type="button" onClick={() => view.current?.zoom(1.25)}
          className="rounded-full border border-gold/45 px-4 py-2 text-xs text-gold">ZOOM OUT</button>
        <button type="button" onClick={() => view.current?.reset()}
          className="rounded-full border border-gold/45 px-4 py-2 text-xs text-gold">RESET</button>
      </div>
      <p className="text-xs text-muted-foreground">
        ROTATE / ZOOM / PAN · Concept geometry from this selected pathway. Relative positions only; no verified measurements or reconstructed physical mesh.
      </p>
    </>}
  </div>;
}
