/** Consumer projections of recorded runs. No projection awards verification. */
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function branchTitle(value: unknown): string {
  const b = record(value);
  const names: Record<string, string> = {
    single_pass_construct: "Create in one pass",
    staged_construct: "Build and check in stages",
    minimal_seeded_construct: "Start with a small working seed",
  };
  return (
    names[String(b["approach"])] ??
    String(
      b["pathway"] ??
        b["name"] ??
        b["approach"] ??
        b["branch_id"] ??
        b["id"] ??
        "Published pathway",
    )
  );
}

export function planningFor(result: unknown) {
  const p = record(record(result)["objective_planning"]);
  const branches = Array.isArray(p["branches"]) ? p["branches"].map(record) : [];
  const selected = record(p["selected_branch"]);
  return {
    branches,
    selected,
    elements: Array.isArray(p["meaning_elements"]) ? p["meaning_elements"].map(record) : [],
  };
}

export function governedPersisted(run: {
  engine?: string | null;
  status: string;
  result: unknown;
}): boolean {
  const r = record(run.result);
  return (
    run.engine === "governed_runtime" &&
    run.status === "verified" &&
    r["transaction"] === "PERSISTED" &&
    r["autosync_verdict"] === "VERIFIED" &&
    record(r["publication"])["delta_in_persisted_ledger"] === true
  );
}

export function receiptFiles(
  result: unknown,
): { name: string; bytes: number | null; sha256: string | null }[] {
  const receipts = record(result)["execution_receipts"];
  if (!Array.isArray(receipts)) return [];
  return receipts.flatMap((r) => {
    const files = record(r)["files"];
    return Array.isArray(files)
      ? files.map((file) => {
          const f = record(file);
          return {
            name:
              typeof f["path"] === "string"
                ? f["path"].split(/[\\/]/).at(-1)!
                : "Recorded artifact",
            bytes: typeof f["bytes"] === "number" ? f["bytes"] : null,
            sha256: typeof f["sha256"] === "string" ? f["sha256"] : null,
          };
        })
      : [];
  });
}

export type ObjectiveModelPrimitive = "box" | "cylinder" | "ring" | "sphere" | "nozzle";
export type ObjectiveModelMaterial =
  | "gold"
  | "gold_deep"
  | "copper"
  | "blue"
  | "blue_deep"
  | "ice"
  | "cyan"
  | "warm"
  | "steel"
  | "dark";

export interface ObjectiveModelPart {
  name: string;
  primitive: ObjectiveModelPrimitive;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  material: ObjectiveModelMaterial;
}

export interface ObjectiveModelSpec {
  /** Short semantic name for the modeled object. */
  title: string;
  /** Normalized scene graph generated for THIS pathway, not a generic category. */
  parts: ObjectiveModelPart[];
  /** Preferred stabilized inspection pose in radians. */
  hero_rotation: [number, number, number];
  /** Relative inspection scale; clamped by the parser. */
  hero_scale: number;
  /** Short factual description of what the geometry represents. */
  description: string;
}

export interface ObjectivePathway {
  id: string;
  label: string;
  summary: string;
  steps: string[];
  tradeoffs: string[];
  spiral_form: string | null;
  visual_svg: string | null;
  model_spec: ObjectiveModelSpec | null;
  /** Real generated concept image for this pathway (image-generation engine). */
  generated_image_url: string | null;
  /** Optional blueprint-style derivative of the generated concept. */
  generated_blueprint_url: string | null;
  /** Optional environment-scene derivative of the generated concept. */
  generated_environment_url: string | null;
  /** Real generated GLB for this pathway when Hunyuan3D has completed it. */
  model_url: string | null;
  model_status?: "queued" | "claimed" | "running" | "completed" | "failed" | null;
  model_error?: string | null;
  outcome_score: number | null;
  outcome_reason: string | null;
}

export interface ObjectiveBlend extends ObjectivePathway {
  blend_from: string[];
  blend_reason: string;
}

export interface ObjectiveDelivery {
  kind: "answer" | "recommendation" | "artifact" | "not_produced";
  title: string;
  body: string;
  pathways: ObjectivePathway[];
  blend: ObjectiveBlend | null;
  files: { name: string; content: string }[];
  limitations: string[];
}

/** Validate external output before displaying or offering it for download. */
export function parseDelivery(value: unknown): ObjectiveDelivery {
  const v = record(value);
  if (
    !["answer", "recommendation", "artifact", "not_produced"].includes(String(v["kind"])) ||
    typeof v["title"] !== "string" ||
    !v["title"].trim() ||
    v["title"].length > 200 ||
    typeof v["body"] !== "string" ||
    !v["body"].trim() ||
    v["body"].length > 40000 ||
    (v["pathways"] !== undefined && !Array.isArray(v["pathways"])) ||
    (Array.isArray(v["pathways"]) && v["pathways"].length > 8) ||
    (v["blend"] !== undefined && v["blend"] !== null && typeof v["blend"] !== "object") ||
    !Array.isArray(v["files"]) ||
    v["files"].length > 8 ||
    !Array.isArray(v["limitations"]) ||
    v["limitations"].some((x) => typeof x !== "string")
  ) {
    throw new Error("The answer engine returned an incomplete result. Retry this result.");
  }
  const normalizedBody = v["body"].toLowerCase();
  const cannedArchitectureMarkers = [
    "the knowledgeverse has mapped",
    "**identity phase:**",
    "**development phase:**",
    "**emergence phase:**",
    "objective's unique chromosome",
    "verified deltas to guide natural evolution",
  ];
  const cannedMarkerCount = cannedArchitectureMarkers.filter((marker) =>
    normalizedBody.includes(marker),
  ).length;
  if (cannedMarkerCount >= 2) {
    throw new Error(
      "The answer engine returned a generic architecture template instead of answering the objective. Retry this result.",
    );
  }
  const number3 = (
    value: unknown,
    fallback: [number, number, number],
    min: number,
    max: number,
  ): [number, number, number] => {
    if (!Array.isArray(value) || value.length !== 3) return fallback;
    return value.map((item, i) => {
      const n = typeof item === "number" && Number.isFinite(item) ? item : fallback[i]!;
      return Math.min(max, Math.max(min, n));
    }) as [number, number, number];
  };
  const parseModelSpec = (value: unknown): ObjectiveModelSpec | null => {
    const m = record(value);
    if (!Object.keys(m).length) return null;
    const title = typeof m["title"] === "string" ? m["title"].trim().slice(0, 160) : "";
    const description =
      typeof m["description"] === "string" ? m["description"].trim().slice(0, 1200) : "";
    const rawParts = Array.isArray(m["parts"]) ? m["parts"].slice(0, 64) : [];
    const allowedPrimitives = new Set<ObjectiveModelPrimitive>([
      "box",
      "cylinder",
      "ring",
      "sphere",
      "nozzle",
    ]);
    const allowedMaterials = new Set<ObjectiveModelMaterial>([
      "gold",
      "gold_deep",
      "copper",
      "blue",
      "blue_deep",
      "ice",
      "cyan",
      "warm",
      "steel",
      "dark",
    ]);
    const parts = rawParts.flatMap((rawPart, index): ObjectiveModelPart[] => {
      const p = record(rawPart);
      const primitive = String(p["primitive"] ?? "") as ObjectiveModelPrimitive;
      const material = String(p["material"] ?? "") as ObjectiveModelMaterial;
      if (!allowedPrimitives.has(primitive) || !allowedMaterials.has(material)) return [];
      const name =
        typeof p["name"] === "string" && p["name"].trim()
          ? p["name"].trim().slice(0, 120)
          : `part-${index + 1}`;
      return [
        {
          name,
          primitive,
          position: number3(p["position"], [0, 0, 0], -3.5, 3.5),
          rotation: number3(p["rotation"], [0, 0, 0], -Math.PI * 2, Math.PI * 2),
          scale: number3(p["scale"], [0.2, 0.2, 0.2], 0.015, 3.5),
          material,
        },
      ];
    });
    if (!title || !description || parts.length < 2) return null;
    const rawHeroScale =
      typeof m["hero_scale"] === "number" && Number.isFinite(m["hero_scale"]) ? m["hero_scale"] : 1;
    return {
      title,
      description,
      parts,
      hero_rotation: number3(m["hero_rotation"], [-0.18, -0.45, 0], -Math.PI * 2, Math.PI * 2),
      hero_scale: Math.min(1.8, Math.max(0.55, rawHeroScale)),
    };
  };

  const parsePathway = (raw: unknown, index: number): ObjectivePathway => {
    const p = record(raw);
    const id = typeof p["id"] === "string" && p["id"].trim() ? p["id"].trim() : `path-${index + 1}`;
    const label = typeof p["label"] === "string" ? p["label"].trim() : "";
    const summary = typeof p["summary"] === "string" ? p["summary"].trim() : "";
    const steps = strings(p["steps"]).slice(0, 12);
    const tradeoffs = strings(p["tradeoffs"]).slice(0, 12);
    const spiralForm =
      typeof p["spiral_form"] === "string" && p["spiral_form"].trim()
        ? p["spiral_form"].trim()
        : null;
    const visualSvg =
      typeof p["visual_svg"] === "string" && /<svg[\s>]/i.test(p["visual_svg"])
        ? p["visual_svg"].slice(0, 100000)
        : null;
    const modelSpec = parseModelSpec(p["model_spec"]);
    const httpsUrl = (value: unknown): string | null =>
      typeof value === "string" && /^https:\/\//i.test(value.trim())
        ? value.trim().slice(0, 4000)
        : null;
    const generatedImageUrl = httpsUrl(p["generated_image_url"]);
    const generatedBlueprintUrl = httpsUrl(p["generated_blueprint_url"]);
    const generatedEnvironmentUrl = httpsUrl(p["generated_environment_url"]);
    const modelUrl = httpsUrl(p["model_url"]);
    const outcomeScore =
      typeof p["outcome_score"] === "number" &&
      Number.isFinite(p["outcome_score"]) &&
      p["outcome_score"] >= 0 &&
      p["outcome_score"] <= 1
        ? p["outcome_score"]
        : null;
    const outcomeReason =
      typeof p["outcome_reason"] === "string" && p["outcome_reason"].trim()
        ? p["outcome_reason"].trim().slice(0, 2000)
        : null;
    if (!label || !summary || label.length > 160 || summary.length > 5000) {
      throw new Error("The answer engine returned an invalid pathway.");
    }
    return {
      id,
      label,
      summary,
      steps,
      tradeoffs,
      spiral_form: spiralForm,
      visual_svg: visualSvg,
      model_spec: modelSpec,
      generated_image_url: generatedImageUrl,
      generated_blueprint_url: generatedBlueprintUrl,
      generated_environment_url: generatedEnvironmentUrl,
      model_url: modelUrl,
      model_status: ["queued", "claimed", "running", "completed", "failed"].includes(
        String(p["model_status"]),
      )
        ? (p["model_status"] as NonNullable<ObjectivePathway["model_status"]>)
        : null,
      model_error: typeof p["model_error"] === "string" ? p["model_error"].slice(0, 4000) : null,
      outcome_score: outcomeScore,
      outcome_reason: outcomeReason,
    };
  };

  const pathways = (Array.isArray(v["pathways"]) ? v["pathways"] : []).map(parsePathway);
  const blendRaw = v["blend"] && typeof v["blend"] === "object" ? v["blend"] : null;
  let blend: ObjectiveBlend | null = null;
  if (blendRaw) {
    const base = parsePathway(blendRaw, pathways.length);
    const b = record(blendRaw);
    const blendFrom = strings(b["blend_from"]).slice(0, 8);
    const blendReason =
      typeof b["blend_reason"] === "string" && b["blend_reason"].trim()
        ? b["blend_reason"].trim().slice(0, 3000)
        : "";
    if (!blendReason) throw new Error("The answer engine returned an incomplete blend pathway.");
    blend = { ...base, blend_from: blendFrom, blend_reason: blendReason };
  }

  const names = new Set<string>();
  const files = v["files"].map((raw) => {
    const f = record(raw);
    if (
      typeof f["name"] !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(f["name"]) ||
      f["name"].includes("..") ||
      names.has(f["name"].toLowerCase()) ||
      typeof f["content"] !== "string" ||
      !f["content"].trim() ||
      f["content"].length > 100000
    ) {
      throw new Error("The answer engine returned an invalid file.");
    }
    names.add(f["name"].toLowerCase());
    return { name: f["name"], content: f["content"] };
  });
  const hasVisualPathway =
    pathways.some((pathway) => Boolean(pathway.visual_svg)) || Boolean(blend?.visual_svg);
  if (v["kind"] === "not_produced" && (files.length || hasVisualPathway))
    throw new Error("An unproduced result cannot carry created artifacts.");
  if (v["kind"] === "artifact" && !files.length && !hasVisualPathway)
    throw new Error("The created result did not include a visual or downloadable artifact.");
  return {
    kind: v["kind"] as ObjectiveDelivery["kind"],
    title: v["title"],
    body: v["body"],
    pathways,
    blend,
    files,
    limitations: v["limitations"] as string[],
  };
}

/* ------------------------------------------------------------------ */
/* Result honesty: what counts as an actual user result.               */
/* ------------------------------------------------------------------ */

export type RequestedKind = "drawing" | "app" | "design" | "answer";

export function supportsEnvisionObjective(objective: string): boolean {
  const o = objective.toLowerCase().trim();
  const kind = requestedKind(o);
  if (kind === "drawing" || kind === "design") return true;

  // Physical/spatial transformations are still inspectable realities even when
  // the user phrases them as a how-to. Keep abstract/software/recipe answers out.
  const physicalSubject =
    /\b(camper|rv|motorhome|trailer|van|vehicle|car|truck|room|office|workspace|living space|interior|house|home|building|shop|workshop|shed|garage|cabin|furniture|machine|device|engine|robot|drone|wearable|shoe|box|enclosure)\b/.test(
      o,
    );
  const transformation =
    /\b(convert|conversion|transform|remodel|renovate|reconfigure|redesign|layout|fit[- ]?out|modify|retrofit|build|make|design|create|prototype|engineer)\b/.test(
      o,
    );

  return physicalSubject && transformation;
}

export function requestedKind(objective: string): RequestedKind {
  const o = objective.toLowerCase().trim();
  // A question about an app or drawing asks for an explanation unless it
  // explicitly commands creation. The noun alone is not an output format.
  if (/^(?:how|why|what|when|where|who|which|does|do|is|are|explain|tell me|describe)\b/.test(o))
    return "answer";
  if (
    /^can (?:you|we)\b/.test(o) &&
    !/\b(draw|sketch|build|make|create|design|write|generate)\b/.test(o)
  )
    return "answer";
  if (
    /\b(draw|drawing|sketch|diagram|illustrat\w*|render|picture|image|blueprint|schematic|visuali[sz]\w*|concept|show|showcase)\b/.test(
      o,
    )
  )
    return "drawing";
  if (/\b(app|application|website|web ?site|program|script|code|software|game|tool|bot)\b/.test(o))
    return "app";
  if (/\b(make|design|invent|build|create|prototype|engineer|develop)\b/.test(o)) return "design";
  return "answer";
}

const SCAFFOLD_LINE =
  /^(#+\s*)?(knowledge form|selected future|actions?:|verification receipts?|governed runtime|recorded artifact|transaction|autosync|revision|meaning elements?|tokens?|chromosome|genesis|lineage|phenotype|sid|id|branch|approach|pathway)\b/i;
const APPROACH_TOKEN =
  /\b(single_?pass_?construct|staged_?construct|minimal_?seeded_?construct|singlepassconstruct|stagedconstruct|minimalseededconstruct)\b/i;

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Why a piece of text is not a real result, or null when it is substantive. */
export function scaffoldReason(text: string, objective: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "it is empty";
  if (/^\s*#*\s*knowledge form\b/im.test(trimmed))
    return "it is a Knowledge Form, not the requested result";
  if (
    /^#\s*ASCENSION Result\b/im.test(trimmed) &&
    /\b(?:Workspace|Capability|Output|Folder|Files|Validation):/i.test(trimmed)
  )
    return "it is a runtime file receipt, not the requested result";
  if (
    /this document turns the command into a clear reviewable artifact with context, structure, and next action/i.test(
      trimmed,
    )
  )
    return "it is a placeholder document, not the requested result";
  if (
    /Small working application generated through the ASCENSION AutoSync bridge|Verified runnable app artifact\.|AutoSync Built Application[\s\S]*Status: running/i.test(
      trimmed,
    )
  )
    return "it is the AutoSync status stub, not an app that performs the requested task";
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const content = lines.filter(
    (l) =>
      !SCAFFOLD_LINE.test(l.replace(/^[-*•]\s*/, "")) &&
      !APPROACH_TOKEN.test(l) &&
      !/^[a-f0-9]{16,}$/i.test(l),
  );
  const shortLines = content.filter((l) => l.replace(/^[-*•\d.)\s]+/, "").split(/\s+/).length <= 3);
  if (
    content.length &&
    shortLines.length / content.length >= 0.6 &&
    !/```|<svg|<html|function |=>|def |class /i.test(trimmed)
  )
    return "it is a token list, not the requested result";
  const obj = normalize(objective);
  const rest = normalize(content.join(" ")).replace(obj, " ").replace(/\s+/g, " ").trim();
  if (rest.length < 60) return "it only repeats the request or lists a plan, path label or receipt";
  return null;
}

export interface ResultAssessment {
  produced: boolean;
  kind: RequestedKind;
  reason: string | null;
  files: { name: string; content: string }[];
}

/** A usable design can enter Hunyuan before a visual artifact exists.
 * This never counts the specification itself as a produced drawing. */
export function hasEnvisionPreparation(objective: string, delivery: ObjectiveDelivery): boolean {
  if (requestedKind(objective) !== "drawing" || delivery.kind === "not_produced") return false;
  if (scaffoldReason(delivery.body, objective) !== null || !delivery.pathways.length) return false;
  const choices = delivery.blend ? [...delivery.pathways, delivery.blend] : delivery.pathways;
  return choices.every((pathway) =>
    pathway.steps.length > 0 &&
    scaffoldReason([pathway.summary, ...pathway.steps].join("\n"), objective) === null,
  );
}

const CODE_FILE = /\.(html?|js|jsx|ts|tsx|py|java|kt|swift|go|rs|rb|php|c|cpp|cs|sh|vue|svelte)$/i;
const INTERNAL_FILE =
  /^(README\.md|governed_objective\.json|artifact_manifest\.json|verification\.json|acceptance_result\.json|metadata\.json|lineage\.json|knowledgeform_.*\.md)$/i;

/**
 * Decide whether delivered text/files are the thing the user asked for.
 * A verified run status or a byte receipt never makes this true by itself.
 */
export function assessResult(
  objective: string,
  body: string,
  files: { name: string; content: string }[],
  visualSvgs: string[] = [],
): ResultAssessment {
  const kind = requestedKind(objective);
  const realFiles = files.filter((f) => {
    if (INTERNAL_FILE.test(f.name)) return false;
    if (/\.svg$/i.test(f.name))
      return (
        /<svg[\s>]/i.test(f.content) &&
        /<(path|line|rect|circle|polyline|polygon|ellipse|g)\b/i.test(f.content)
      );
    return scaffoldReason(f.content, objective) === null;
  });
  const bodyOk = scaffoldReason(body, objective) === null;
  if (kind === "drawing") {
    const drawings = realFiles.filter((f) => /\.svg$/i.test(f.name));
    const pathwayDrawings = visualSvgs.filter(
      (svg) =>
        /<svg[\s>]/i.test(svg) &&
        /<(path|line|rect|circle|polyline|polygon|ellipse|g)\b/i.test(svg),
    );
    if (drawings.length || pathwayDrawings.length)
      return { produced: true, kind, reason: null, files: realFiles };
    return {
      produced: false,
      kind,
      reason: "no visual drawing was returned in either the main artifact or the Spiral pathways",
      files: [],
    };
  }
  if (kind === "app") {
    const code = realFiles.filter((f) => CODE_FILE.test(f.name));
    if (code.length || (bodyOk && /```[\s\S]+```/.test(body)))
      return { produced: true, kind, reason: null, files: realFiles };
    return {
      produced: false,
      kind,
      reason:
        realFiles.length || bodyOk
          ? "no app code was returned"
          : scaffoldReason(files[0]?.content ?? body, objective),
      files: [],
    };
  }
  if (bodyOk || realFiles.length) return { produced: true, kind, reason: null, files: realFiles };
  return {
    produced: false,
    kind,
    reason: scaffoldReason(body, objective),
    files: [],
  };
}

export function notProducedMessage(kind: RequestedKind) {
  return kind === "drawing"
    ? "The requested drawing has not been produced."
    : kind === "app"
      ? "The requested app has not been produced."
      : kind === "design"
        ? "The requested design has not been produced."
        : "The requested answer has not been produced.";
}
