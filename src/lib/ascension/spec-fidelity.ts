import type { ObjectivePathway } from "./result-model";

/**
 * Semantic coverage check for an interpretive model_spec. A spec is only shown
 * as a finished subject assembly when its named parts cover the essential
 * components named by the selected pathway; otherwise the viewer must say the
 * physical geometry is incomplete. General-purpose: no subject-specific rules.
 */
export type SpecFidelity = {
  status: "complete" | "incomplete" | "none";
  covered: string[];
  missing: string[];
  reason: string;
};

const STOP = new Set(
  "the and for with from into onto that this then than each via using use used make build design create develop add attach install integrate implement connect provide ensure enable allow test tests testing their them they its it's are was were will can could should would into over under between within using based system systems overall final initial basic simple main primary secondary general concept conceptual interpretive unverified".split(" "),
);
// Words that name nothing specific when they are the only content of a part name.
const GENERIC = new Set(
  "main body chassis assembly base part parts component components structure module unit core piece element block object housing shell box cylinder sphere ring nozzle primitive left right top bottom front rear upper lower inner outer support".split(" "),
);

const words = (text: string) =>
  text.toLowerCase().replace(/[_\-/]+/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
const stem = (w: string) => w.replace(/(ings|ing|ers|er|ies|es|s)$/, "").slice(0, 6);

export function specFidelity(path: Pick<ObjectivePathway, "steps" | "model_spec" | "label">): SpecFidelity {
  const spec = path.model_spec;
  if (!spec) return { status: "none", covered: [], missing: [], reason: "No semantic model specification was produced." };
  const specific = spec.parts.filter((p) => words(p.name).some((w) => !GENERIC.has(w)));
  const partStems = new Set(spec.parts.flatMap((p) => words(p.name)).filter((w) => !GENERIC.has(w)).map(stem));
  const steps = path.steps.filter((s) => words(s).some((w) => !GENERIC.has(w)));
  const covered: string[] = [], missing: string[] = [];
  for (const step of steps) (words(step).some((w) => !GENERIC.has(w) && partStems.has(stem(w))) ? covered : missing).push(step);
  const primitives = new Set(spec.parts.map((p) => p.primitive)).size;
  const coverage = steps.length ? covered.length / steps.length : 1;
  const problems: string[] = [];
  if (spec.parts.length < 4) problems.push(`only ${spec.parts.length} parts`);
  if (specific.length < Math.min(3, spec.parts.length)) problems.push("parts lack subject-specific names");
  if (primitives < 2) problems.push("a single repeated primitive");
  if (coverage < 0.6) problems.push(`${missing.length} of ${steps.length} selected components are not represented`);
  return problems.length
    ? { status: "incomplete", covered, missing, reason: `Physical geometry incomplete: ${problems.join("; ")}.` }
    : { status: "complete", covered, missing, reason: "Named parts cover the selected pathway components (still unverified)." };
}
