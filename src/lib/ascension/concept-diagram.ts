import * as THREE from "three";
import type { ObjectivePathway } from "./result-model";
import type { DesignPart } from "./parts-model";

/** A reading-order diagram of supplied design data, never a fabricated physical model. */
export function deriveConceptParts(objective: string, pathway: ObjectivePathway): DesignPart[] {
  const supplied = pathway.model_spec?.parts.map(part => part.name) ?? [];
  const entries = supplied.length ? supplied : pathway.steps.length ? pathway.steps : [pathway.label, pathway.summary];
  return [...new Set(entries.filter(text => text.trim()))].slice(0, 8).map((text, index) => ({
    name: text.length > 90 ? `${text.slice(0, 87)}…` : text,
    x: 0.5, y: 0.5,
    purpose: pathway.summary || objective,
    location: `Concept diagram element ${index + 1} · ${pathway.label}; not a measured physical location.`,
    operation: supplied.length ? pathway.model_spec?.description || text : text,
    connections: "Diagram order follows the supplied pathway; physical connections are unavailable.",
    limitations: [...pathway.tradeoffs, "Derived concept / unverified. Dimensions, internal construction and physical feasibility are unavailable."].join(" · "),
  }));
}

export function buildConceptDiagram(parts: DesignPart[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "Derived pathway concept diagram";
  parts.forEach((part, index) => {
    // Deliberately diagrammatic hexagonal plates, not a pretend shoe/engine/room.
    const shape = new THREE.Shape();
    for (let corner = 0; corner < 6; corner++) {
      const angle = corner * Math.PI / 3;
      const x = Math.cos(angle) * 1.35, y = Math.sin(angle) * 0.8;
      if (corner === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.06, bevelThickness: 0.04 }),
      new THREE.MeshStandardMaterial({ color: index % 2 ? "#b59a75" : "#739ba2", roughness: 0.45, metalness: 0.25 }));
    mesh.name = part.name;
    mesh.position.set((index % 2 - 0.5) * 3.4, (Math.ceil(parts.length / 2) / 2 - Math.floor(index / 2)) * 2.1, (index % 3) * 0.32);
    mesh.userData["conceptPart"] = part;
    group.add(mesh);
  });
  return group;
}

/** Explode around the diagram centre; restoring keeps any prior user edits intact. */
export function explodeConcept(group: THREE.Group, enabled: boolean, saved: Map<THREE.Object3D, THREE.Vector3>) {
  for (const node of group.children) {
    if (enabled && !saved.has(node)) { saved.set(node, node.position.clone()); node.position.multiplyScalar(1.55); }
    else if (!enabled && saved.has(node)) { const position = saved.get(node); if (position) node.position.copy(position); saved.delete(node); }
  }
  group.updateWorldMatrix(true, true);
}