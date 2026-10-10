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

/** Render named, subject-dependent assembly geometry, not identical hex tiles. */
export function buildConceptDiagram(
  parts: DesignPart[],
  palette: { structure: string; energy: string },
  modelSpec?: import("./result-model").ObjectiveModelSpec | null,
): THREE.Group {
  const group = new THREE.Group();
  group.name = modelSpec?.title ?? "Unverified pathway assembly";
  const primitive = (kind: string): THREE.BufferGeometry => {
    switch (kind) {
      case "cylinder": return new THREE.CylinderGeometry(0.46, 0.46, 1.5, 36);
      case "ring": return new THREE.TorusGeometry(0.62, 0.16, 20, 48);
      case "sphere": return new THREE.SphereGeometry(0.65, 28, 20);
      case "nozzle": return new THREE.ConeGeometry(0.6, 1.6, 36);
      default: return new THREE.BoxGeometry(1.5, 0.46, 0.8);
    }
  };
  const inferredPrimitive = (label: string) => {
    if (/\\b(?:coil|winding|solenoid|toroid|loop|ring|wheel)\\b/i.test(label)) return "ring";
    if (/\\b(?:magnet|motor|engine|shaft|rod|rotor|piston|tube|cylinder|hub)\\b/i.test(label)) return "cylinder";
    if (/\\b(?:nozzle|cone|jet|exhaust)\\b/i.test(label)) return "nozzle";
    if (/\\b(?:sensor|sphere|ball|bearing)\\b/i.test(label)) return "sphere";
    return "box";
  };
  parts.forEach((part, index) => {
    const specification = modelSpec?.parts[index];
    const shape = primitive(specification?.primitive ?? inferredPrimitive(part.name));
    const mesh = new THREE.Mesh(
      shape,
      new THREE.MeshStandardMaterial({
        color: index % 2 ? palette.structure : palette.energy,
        roughness: 0.4,
        metalness: 0.26,
      }),
    );
    mesh.name = part.name;
    if (specification) {
      mesh.position.set(...specification.position);
      mesh.rotation.set(...specification.rotation);
      mesh.scale.set(...specification.scale);
    } else {
      mesh.position.set(
        (index % 3 - 1) * 1.95,
        (Math.ceil(parts.length / 3) / 2 - Math.floor(index / 3)) * 1.5,
        (index % 2) * 0.32,
      );
    }
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