import type { Json } from "@/integrations/supabase/types";
import {
  assessResult,
  notProducedMessage,
  parseDelivery,
  requestedKind,
  type ObjectiveDelivery,
} from "../result-model";

const ORDINAL = 100;
const ARTIFACT_ORDINAL = 101;
// V2: projections are assessed so plans/Knowledge Forms/receipts are never a user result.
const LABEL = "GOVERNED_RUNTIME_RESULT_V2";
const MODEL = "governed-runtime";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanGeneratedText(value: string): string {
  return value
    .replace(/&#x20;|&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function stripModelProvenanceClaims(value: string): string {
  return value
    .replace(
      /\bAccording to ASCENSION(?:'s)? internal (?:knowledge|records)(?:\s*\[[^\]]+\])?,?\s*/gi,
      "From general knowledge, ",
    )
    .replace(
      /\bASCENSION(?:'s)? internal (?:knowledge|records)(?:\s*\[[^\]]+\])?\s+(?:confirms|notes|shows|indicates|states|establishes|demonstrates|supports|suggests)\s+(?:that\s+)?/gi,
      "From general knowledge, ",
    )
    .replace(/\s*\[A\d+(?:\s*,\s*A?\d+)*\]/gi, "")
    .replace(/\bASCENSION(?:'s)? internal (?:knowledge|records)\b/gi, "general knowledge")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function artifactFiles(value: unknown): { name: string; content: string }[] {
  const payload = record(value);
  if (!Array.isArray(payload["files"])) return [];
  const names = new Set<string>();
  return payload["files"].flatMap((raw) => {
    const file = record(raw);
    const name = typeof file["name"] === "string" ? file["name"].trim() : "";
    const content = typeof file["content"] === "string" ? file["content"] : "";
    const key = name.toLowerCase();
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name) ||
      name.includes("..") ||
      !content ||
      content.length > 100000 ||
      names.has(key)
    ) {
      return [];
    }
    names.add(key);
    return [{ name, content }];
  });
}

export function governedDelivery(
  run: {
    objective: string;
    result: Json | null;
  },
  transportedFiles: { name: string; content: string }[],
) {
  if (run.result === null) return null;

  const result = record(run.result);
  if (!Object.keys(result).length) return null;

  const receipts = Array.isArray(result["execution_receipts"])
    ? result["execution_receipts"].flatMap((rawReceipt) => {
        const receipt = record(rawReceipt);
        const files = Array.isArray(receipt["files"]) ? receipt["files"] : [];
        return files.map((rawFile) => {
          const file = record(rawFile);
          return {
            path: typeof file["path"] === "string" ? file["path"] : "Recorded artifact",
            bytes: typeof file["bytes"] === "number" ? file["bytes"] : null,
            sha256: typeof file["sha256"] === "string" ? file["sha256"] : null,
          };
        });
      })
    : [];

  const titleSource =
    typeof result["objective_text"] === "string" && result["objective_text"].trim()
      ? result["objective_text"].trim()
      : run.objective.trim();

  const requestedOutput = record(result["requested_output"]);
  const primaryName =
    typeof requestedOutput["primary_artifact"] === "string"
      ? requestedOutput["primary_artifact"]
      : "";
  const primary =
    transportedFiles.find((file) => file.name === primaryName) ??
    transportedFiles.find((file) => /^ascension_result\.md$/i.test(file.name)) ??
    transportedFiles.find((file) => /^document\.md$/i.test(file.name)) ??
    transportedFiles.find(
      (file) =>
        !/^(README\.md|governed_objective\.json|artifact_manifest\.json|verification\.json|acceptance_result\.json|metadata\.json|lineage\.json|knowledgeform_.*\.md)$/i.test(
          file.name,
        ),
    ) ??
    null;
  const assessment = assessResult(run.objective, primary?.content ?? "", transportedFiles);

  if (!assessment.produced) {
    const lines = [
      notProducedMessage(assessment.kind),
      `The ASCENSION runtime finished this run, but what it returned is not the result you asked for${assessment.reason ? ` (${assessment.reason})` : ""}.`,
    ];
    return parseDelivery({
      kind: "not_produced",
      title: titleSource.slice(0, 200) || "ASCENSION result",
      body: lines.join("\n\n"),
      files: [],
      limitations: receipts.length
        ? [
            `The runtime's file receipt${receipts.length === 1 ? "" : "s"} confirm${receipts.length === 1 ? "s" : ""} stored bytes only. ${receipts.length === 1 ? "It does" : "They do"} not show the objective was accomplished.`,
          ]
        : [],
    });
  }

  const primaryOk = primary && assessment.files.some((f) => f.name === primary.name);
  const answerFile = assessment.files.find((file) => /\.(md|txt)$/i.test(file.name));
  const body =
    assessment.kind === "app"
      ? "Your runnable app is ready below. Download the HTML file and open it in your browser."
      : assessment.kind === "drawing"
        ? "Your drawing is shown below. Download the SVG to keep or edit it."
        : primaryOk && /\.(md|txt)$/i.test(primary.name)
          ? primary.content.trim()
          : answerFile
            ? answerFile.content.trim()
            : "Your result is ready to download below.";

  const transportedNames = new Set(assessment.files.map((file) => file.name.toLowerCase()));
  const missingReceipts = receipts.filter((receipt) => {
    const basename = receipt.path.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
    return basename && basename !== "governed_objective.json" && !transportedNames.has(basename);
  });

  const answerLimitations =
    requestedOutput["truth_status"] === "UNVERIFIED_MODEL_DRAFT"
      ? [
          "A local model drafted this answer. Its factual claims have not been independently checked.",
        ]
      : [];

  return parseDelivery({
    kind: assessment.kind === "answer" || assessment.kind === "design" ? "answer" : "artifact",
    title: titleSource.slice(0, 200) || "ASCENSION result",
    body: body.slice(0, 40000),
    files: assessment.kind === "answer" || assessment.kind === "design" ? [] : assessment.files,
    limitations: [
      ...answerLimitations,
      ...(missingReceipts.length
        ? [
            `${missingReceipts.length} recorded file${missingReceipts.length === 1 ? " has" : "s have"} a receipt but ${missingReceipts.length === 1 ? "its" : "their"} contents have not reached the website yet.`,
          ]
        : []),
    ],
  });
}

export async function externalProductDraft(
  run: {
    objective: string;
    evidence?: Json | null;
    constraints?: Json | null;
    result: Json | null;
    status?: string;
  },
  transportedFiles: { name: string; content: string }[],
): Promise<ObjectiveDelivery> {
  const normalizedObjective = run.objective
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const asksCapabilities =
    /^(what|wat) (can|do) (u|you) do$/.test(normalizedObjective) ||
    /^(what|wat) can ascension do$/.test(normalizedObjective) ||
    /^(what|wat) does ascension do$/.test(normalizedObjective) ||
    /^(explain|describe) ascension$/.test(normalizedObjective);

  if (asksCapabilities) {
    return parseDelivery({
      kind: "answer",
      title: "What ASCENSION can do",
      body: [
        "ASCENSION is built to take an objective from idea to a verified result.",
        "",
        "You tell ASCENSION what you want to accomplish. CLARITY orchestrates the objective, breaks its meaning into Meaning Elements, retrieves relevant knowledge, builds multiple pathways through the World Model and DTF, compares outcomes, confidence and contradictions, applies Guardian constraints, then sends the selected pathway to the proper execution engine.",
        "",
        "ASCENSION can work across software, documents, images, CAD, simulation, web apps, databases, box design, video, music, robotics, printers, drones and other connected execution tools. It is designed to return the thing requested — not just a plan or a Knowledge Form.",
        "",
        "AutoSync checks outputs against the objective and evidence. Verified results can be persisted into the Knowledgeverse with lineage and Delta learning so later objectives can build from what was actually learned.",
        "",
        "In this web app, I can immediately answer questions, generate specifications, write code and create supported digital artifacts. When a connected governed execution engine is required, ASCENSION sends the objective through that runtime and reports the verified result when it comes back.",
        "",
        "The operating loop is: Objective -> Meaning -> Knowledge -> Pathways -> Evaluation -> Guardian -> Execution -> AutoSync verification -> Persisted result -> Delta learning.",
      ].join("\n"),
      pathways: [],
      blend: null,
      files: [],
      limitations: [],
    });
  }

  const { callZai } = await import("./zai.server");

  const artifactContext = transportedFiles
    .filter((file) => !/^knowledgeform_/i.test(file.name))
    .slice(0, 6)
    .map((file) => `FILE: ${file.name}\n${file.content.slice(0, 12000)}`)
    .join("\n\n");

  const planning = record(record(run.result)["objective_planning"]);
  const mesh = record(planning["engine_mesh"]);
  const engines = record(mesh["engines"]);
  const spiral = record(engines["Spiral"]);
  const spiralOutput = Array.isArray(spiral["output"]) ? spiral["output"].map(record) : [];
  const spiralForms = [
    ...new Set(
      spiralOutput.flatMap((item) =>
        Array.isArray(item["expanded_forms"])
          ? item["expanded_forms"].filter((value): value is string => typeof value === "string")
          : [],
      ),
    ),
  ].slice(0, 5);
  const spiralContext = spiralForms.length
    ? `SPIRAL EXPANSION FOR THIS OBJECTIVE:\n${spiralForms
        .map((form, index) => `${index + 1}. ${form}`)
        .join("\n")}`
    : "";

  const outcomePredictor = record(engines["Outcome Predictor"]);
  const outcomeOutput = Array.isArray(outcomePredictor["output"])
    ? outcomePredictor["output"].map(record)
    : [];
  const outcomeContext = outcomeOutput.length
    ? `OUTCOME PREDICTOR CONTEXT:\n${JSON.stringify(outcomeOutput).slice(0, 8000)}`
    : "";

  const system = [
    "You are the user-facing response engine inside ASCENSION, not a generic chatbot. Never introduce yourself as 'an AI language model'.",
    "ASCENSION is an objective-driven system: it takes what the user wants to accomplish, decomposes meaning, retrieves relevant knowledge, models and compares pathways, checks confidence and contradictions, applies Guardian constraints, executes through available engines, verifies with AutoSync, and persists verified outcomes and learning.",
    "Its named architecture includes CLARITY orchestration; Meaning Elements; Knowledgeverse; World Model; DTF pathway planning; Outcome Predictor; Confidence Engine; Contradiction Engine; Guardian; AutoSync; and execution engines for software, documents, images, CAD, simulation, box design, video, music, web, databases, robotics, printers, drones, and other connected tools.",
    "When the user asks what ASCENSION can do, explain ASCENSION specifically. Distinguish what this web response can produce immediately from capabilities that require the governed runtime or a connected execution tool. Do not claim a tool is connected or a physical action occurred unless evidence says so.",
    "Write a useful user-facing result now. ASCENSION governed execution may still be pending; available artifacts can be receipts, plans, Knowledge Forms, or scaffolds.",
    "Do not claim you physically built, tested, verified, persisted, or governed anything.",
    "Return exactly one JSON object with keys: kind, title, body, pathways, blend, files, limitations.",
    "The body must be clean readable plain text. Do not emit Markdown markers, escaped Markdown, or HTML entities.",
    "pathways must be an array. When a SPIRAL EXPANSION is supplied, create one substantive user-facing solution pathway for each Spiral form instead of collapsing them into one answer.",
    "Each pathway object must contain id, label, summary, steps, tradeoffs, spiral_form, visual_svg, model_spec, outcome_score, outcome_reason. steps and tradeoffs are string arrays. Set visual_svg and model_spec to null; ENVISION uses only the Hunyuan3D GLB pipeline.",
    "outcome_score is 0..1 when a grounded relative assessment can be made from the supplied context; otherwise use null. outcome_reason must briefly explain the basis without pretending the score is physically verified.",
    "The pathway content is a Spiral-guided user-facing synthesis, not a claim that the governed runtime physically executed or verified that solution.",
    "Make the pathways materially different approaches to accomplishing the objective. Do not merely rename the same answer.",
    "For ordinary objectives with multiple useful routes, return 3 materially different pathways even when Spiral context is sparse. Do not collapse to one pathway merely because one route is safer, more conventional, or more cautious.",
    "When Spiral supplies three forms, return three pathways unless one form genuinely cannot produce a distinct useful route; do not silently collapse them.",
    "When a request has safety, security, legal, or authorization implications, do not assume the user's skill level, ownership, motive, or situation. Do not moralize or turn the entire answer into a warning.",
    "If any requested operational detail cannot be safely supplied, state that boundary once and briefly, then still answer the safe portion directly and provide at least 3 useful alternative pathways such as diagnosis, authorized repair/replacement, and emergency recovery. A safety caveat may be one pathway; it must not erase the rest of the useful answer.",
    "For troubleshooting requests, prioritize practical fault isolation and restoration steps over generic architecture prose.",
    "blend must be an object when two or more useful pathways exist. It must contain id, label, summary, steps, tradeoffs, spiral_form, visual_svg, model_spec, outcome_score, outcome_reason, blend_from, blend_reason. Set visual_svg and model_spec to null; the blend's visual authority is its Hunyuan3D GLB.",
    "The BLEND pathway is where Spiral and Outcome Predictor work together: combine complementary strengths from the distinct pathways, explicitly account for their tradeoffs and the supplied Outcome Predictor context, and explain the blend in blend_reason. Do not simply concatenate every pathway.",
    "blend_from is an array of the pathway ids or labels whose strongest elements were combined. Use spiral_form 'spiral_outcome_blend'.",
    "If fewer than two useful pathways exist, return blend as null.",
    'kind must be "answer" or "artifact".',
    "For ordinary questions, how-to requests, conversions, builds, product/invention requests, and planning requests, give a substantive direct result in body. Start by addressing the user's actual objective and the physical or functional result requested; do not substitute a generic overview, lecture, architecture explanation, disclaimer, or peripheral subsystem.",
    "For a how-to or conversion objective, body must contain an actionable objective-specific sequence: what to change, how the major zones or components work together, and a practical order of operations. Do not make one incidental subsystem the answer unless the user actually asked about that subsystem.",
    "Do not infer the user's skill level. Keep generic compliance notes out of the main answer; the main answer must solve the stated objective.",
    "For app/code requests, include complete runnable source files.",
    "For visual requests keep body concise: briefly explain what was created and the key design logic; do not bury the visual under a long essay.",
    "For product/invention creation requests, create a substantive design/specification rather than a receipt, token list, or plan to make one.",
    "files must be an array of objects with name and content. Use [] when no download is needed.",
    "limitations must truthfully state what remains unverified or conceptual.",
    "Never return a Knowledge Form, execution receipt, or placeholder. Only explain ASCENSION architecture when the user is actually asking about ASCENSION's capabilities or how it works.",
  ].join(" ");

  const evidenceContext = Array.isArray(run.evidence)
    ? run.evidence
        .map((item) => String(item))
        .filter(Boolean)
        .slice(0, 32)
        .join("\n")
    : "";
  const constraintContext = Array.isArray(run.constraints)
    ? run.constraints
        .map((item) => String(item))
        .filter(Boolean)
        .slice(0, 32)
        .join("\n")
    : "";

  const user = [
    `OBJECTIVE:\n${run.objective}`,
    evidenceContext ? `USER / OBJECTIVE EVIDENCE:\n${evidenceContext}` : "",
    constraintContext ? `OBJECTIVE CONSTRAINTS:\n${constraintContext}` : "",
    `GOVERNED RUNTIME STATUS: ${run.status ?? "unknown"} (do not claim this draft is verified)`,
    spiralContext,
    outcomeContext,
    artifactContext
      ? `\nGOVERNED RUNTIME ARTIFACTS / CONTEXT:\n${artifactContext}`
      : "\nNo usable runtime artifact content was transported.",
    spiralForms.length
      ? "\nUse the Spiral expansion to produce multiple distinct solution pathways. Do not collapse them into a single recommendation."
      : "",
    "\nProduce the requested user-facing result now.",
  ].join("\n");

  const generated = await callZai({
    system,
    user,
    knowledgeQuery: run.objective,
    temperature: 0.25,
  });
  const { formatInternalConnection } = await import("./knowledge.server");
  const internalConnection = generated.knowledge
    ? formatInternalConnection(generated.knowledge, 3)
    : "";

  const candidate =
    generated.json ??
    ({
      kind: "answer",
      title: run.objective.slice(0, 200) || "ASCENSION result",
      body: generated.text.trim(),
      pathways: [],
      blend: null,
      files: [],
      limitations: [],
    } as Record<string, unknown>);
  // Local engines sometimes return limitations as a plain string. Normalize
  // at this external boundary — the delivery contract itself stays strict.
  if (typeof candidate["limitations"] === "string" && candidate["limitations"].trim()) {
    candidate["limitations"] = [candidate["limitations"].trim()];
  } else if (!Array.isArray(candidate["limitations"])) {
    candidate["limitations"] = [];
  }

  if (typeof candidate["title"] === "string") {
    candidate["title"] = cleanGeneratedText(candidate["title"]);
  }
  if (typeof candidate["body"] === "string") {
    const modelBody = stripModelProvenanceClaims(cleanGeneratedText(candidate["body"]));
    candidate["body"] = cleanGeneratedText(
      internalConnection
        ? `${internalConnection}\n\nGeneral-knowledge explanation:\n${modelBody}`
        : modelBody,
    );
  }
  if (Array.isArray(candidate["limitations"])) {
    candidate["limitations"] = candidate["limitations"].map((item) =>
      typeof item === "string" ? cleanGeneratedText(item) : item,
    );
  }

  let parsed = parseDelivery(candidate);

  // Reject the exact failure mode where an ordinary objective is replaced by
  // a generic compliance/professional disclaimer. One bounded repair call
  // rewrites the SAME objective; it does not change the user's request.
  const bodyText = parsed.body.trim();
  const disclaimerOnly =
    bodyText.length < 1200 &&
    /(?:qualified personnel|consult (?:a )?professional|local (?:safety )?codes|manufacturer(?:'s)? manual|owner(?:'s)? manual)/i.test(bodyText);

  if (disclaimerOnly) {
    const repaired = await callZai({
      system: [
        system,
        "REPAIR REQUIRED: the previous response failed because it replaced the user's objective with a generic disclaimer.",
        "Return the complete JSON response again.",
        "The body must directly solve the stated objective with concrete objective-specific guidance.",
        "Do not center the answer on electrical, plumbing, structural, legal, safety, code, manual, or professional-referral language unless that subsystem is itself the objective.",
        "Preserve all useful distinct Spiral pathways and BLEND.",
      ].join(" "),
      user: [
        `OBJECTIVE:\n${run.objective}`,
        `FAILED RESPONSE:\n${JSON.stringify(candidate).slice(0, 12000)}`,
        "Rewrite it so the requested objective—not a disclaimer or incidental subsystem—is the answer.",
      ].join("\n\n"),
      knowledgeQuery: run.objective,
      temperature: 0.2,
    });
    const repairedCandidate =
      repaired.json ??
      ({
        kind: "answer",
        title: run.objective.slice(0, 200) || "ASCENSION result",
        body: repaired.text.trim(),
        pathways: parsed.pathways,
        blend: parsed.blend,
        files: [],
        limitations: [],
      } as Record<string, unknown>);
    if (typeof repairedCandidate["limitations"] === "string") {
      repairedCandidate["limitations"] = [repairedCandidate["limitations"]];
    } else if (!Array.isArray(repairedCandidate["limitations"])) {
      repairedCandidate["limitations"] = [];
    }
    parsed = parseDelivery(repairedCandidate);
  }

  const requested = requestedKind(run.objective);

  // Primitive model_spec/SVG output is legacy planning metadata only. It must
  // never trigger a second AI call or become the visual authority. Real visual
  // delivery is the hidden reference -> Hunyuan3D -> GLB pipeline below.

  // VISUAL objectives: generate an INTERNAL reference image for every pathway
  // and blend. These references feed Hunyuan image-to-3D and are never the
  // user-facing ENVISION result. No procedural geometry is a fallback.
  if (requested === "drawing" || requested === "design") {
    const { generatePathwayImages } = await import("./image.server");
    const visualChoices = parsed.blend ? [...parsed.pathways, parsed.blend] : parsed.pathways;
    const { urls: imageUrls, errors: imageErrors } = await generatePathwayImages(
      run.objective,
      visualChoices,
      run.id,
    );
    if (imageUrls.size) {
      const withImage = <T extends { id: string; generated_image_url: string | null }>(
        pathway: T,
      ): T => {
        const url = imageUrls.get(pathway.id);
        return url ? { ...pathway, generated_image_url: url } : pathway;
      };
      parsed = {
        ...parsed,
        pathways: parsed.pathways.map(withImage),
        blend: parsed.blend ? withImage(parsed.blend) : null,
      };
    }
    // Pathways are still delivered; 3D is queued only where a durable
    // reference exists. No primitive geometry is substituted.
    if (imageErrors.length) {
      parsed = {
        ...parsed,
        limitations: [
          ...parsed.limitations,
          `3D generation could not start for ${imageErrors.length} pathway(s) because the internal reference image failed: ${imageErrors.slice(0, 3).join(" | ").slice(0, 900)}`,
        ],
      };
    }
  }

  const visualSvgs = [
    ...parsed.pathways
      .map((pathway) => pathway.visual_svg)
      .filter((value): value is string => Boolean(value)),
    ...(parsed.blend?.visual_svg ? [parsed.blend.visual_svg] : []),
  ];
  const check = assessResult(run.objective, parsed.body, parsed.files, visualSvgs);
  if (!check.produced || parsed.kind === "not_produced")
    throw new Error(
      `the external engine did not return a substantive result${check.reason ? ` (${check.reason})` : ""}`,
    );

  return {
    ...parsed,
    files: check.kind === "answer" || check.kind === "design" ? [] : check.files,
    limitations: [
      ...parsed.limitations,
      "Governed ASCENSION verification and persistence continue separately.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Delivery resolution shared by the signed-in and guest paths.        */
/* ------------------------------------------------------------------ */

export const TERMINAL_STATUSES = new Set(["verified", "rejected", "failed"]);
export const DRAFT_ORDINAL = 102;
export const DRAFT_LABEL = "ASCENSION_GENERATED_RESULT";
/** How long a verified run waits for its separately transported files. */
export const ARTIFACT_GRACE_MS = 90_000;
/** A draft left "running" longer than this is considered abandoned. */
export const DRAFT_STALE_MS = 180_000;

export interface ResolvedDelivery {
  created_at: string;
  status: "running" | "completed";
  response_payload: ObjectiveDelivery | null;
  error: string | null;
  engine_model: string | null;
  engine_label: string;
  /** Plain-language description of what is still pending. */
  note: string | null;
  /** "governed" projection of the runtime result, or the external unverified draft. */
  source: "governed" | "external_draft" | null;
}

export interface DraftRow {
  status: string;
  created_at: string;
  response_payload: unknown;
  error: string | null;
  engine_model: string | null;
  source_key: string | null;
}

export interface DraftStore {
  claim(sourceKey: string, expectedCreatedAt: string | null): Promise<boolean>;
  complete(sourceKey: string, payload: ObjectiveDelivery): Promise<void>;
  fail(sourceKey: string, message: string): Promise<void>;
}

export interface DeliveryRun {
  id: string;
  objective: string;
  evidence?: Json | null;
  constraints?: Json | null;
  status: string;
  result: Json | null;
  completed_at: string | null;
  updated_at?: string | null;
  created_at: string;
}

const DRAFT_SCHEMA_VERSION = "real-3d-v7";

/** Stable identity of the transported artifacts and delivery contract a projection was made from. */
export function artifactSourceKey(runId: string, files: { name: string; content: string }[]) {
  let h = 2166136261;
  const text = files.map((f) => `${f.name}:${f.content.length}:${f.content}`).join("\u0000");
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return `${DRAFT_SCHEMA_VERSION}:${runId}:${files.length}:${h.toString(16)}`;
}

export function draftFromStage(stage: unknown): DraftRow | null {
  const s = record(stage);
  if (!Object.keys(s).length) return null;
  return {
    status: String(s["status"] ?? ""),
    created_at: String(s["created_at"] ?? ""),
    response_payload: s["response_payload"] ?? null,
    error: typeof s["error"] === "string" ? s["error"] : null,
    engine_model: typeof s["engine_model"] === "string" ? s["engine_model"] : null,
    source_key:
      typeof record(s["request_payload"])["source_key"] === "string"
        ? (record(s["request_payload"])["source_key"] as string)
        : null,
  };
}

type DraftGenerator = typeof externalProductDraft;

/**
 * Decide what the answer panel shows. Never terminal while the governed run is
 * still running; never sticky when later artifacts arrive (the projection is
 * recomputed from the current artifacts every read, which is cheap and makes
 * no model call); the external draft is generated at most once per artifact
 * set because a stage row must be claimed first.
 */
export async function resolveDelivery(args: {
  run: DeliveryRun;
  artifactStage: { status: string; response_payload: unknown } | null;
  draft: DraftRow | null;
  store: DraftStore;
  retry: boolean;
  now?: number;
  generate?: DraftGenerator;
}): Promise<ResolvedDelivery> {
  const { run, artifactStage, draft, store, retry } = args;
  const now = args.now ?? Date.now();
  const generate = args.generate ?? externalProductDraft;
  const base = {
    created_at: run.completed_at ?? run.updated_at ?? run.created_at,
    error: null,
    engine_model: "governed-runtime",
    engine_label: LABEL,
    source: null,
  } as const;
  const pending = (note: string, extra: Partial<ResolvedDelivery> = {}): ResolvedDelivery => ({
    ...base,
    status: "running",
    response_payload: null,
    note,
    ...extra,
  });

  // The user-facing draft can start as soon as the objective is accepted.
  // The governed runtime continues independently and can supersede this draft
  // if it later transports the actual requested result.
  const files =
    artifactStage?.status === "completed" ? artifactFiles(artifactStage.response_payload) : [];
  const governed = run.status === "verified" ? governedDelivery(run, files) : null;
  if (governed && governed.kind !== "not_produced") {
    return {
      ...base,
      status: "completed",
      response_payload: governed,
      note: null,
      source: "governed",
    };
  }

  // The governed result is not the thing that was asked for. Ask the external
  // engine for a clearly unverified draft — once per artifact set.
  const sourceKey = artifactSourceKey(run.id, files);
  const hasLovableAi = Boolean(process.env["LOVABLE_API_KEY"]?.trim());
  const hasExplicitLocal = Boolean(process.env["LOCAL_LLM_BASE_URL"]?.trim());
  const hasOptInZai =
    Boolean(process.env["ZAI_API_KEY"]?.trim()) &&
    process.env["ASCENSION_ALLOW_PAID_DRAFTS"] === "true";
  const draftBase = {
    ...base,
    engine_label: DRAFT_LABEL,
    engine_model: draft?.engine_model ?? null,
  };
  // A Windows/local draft is only reusable when no hosted Lovable response
  // path is available. Hosted ASCENSION must supersede stale local drafts.
  const localSource = draft?.source_key === `local:${run.id}` && !hasLovableAi;
  const sameSource = localSource || draft?.source_key === sourceKey;

  if (draft?.status === "completed" && sameSource) {
    try {
      return {
        ...draftBase,
        created_at: draft.created_at,
        status: "completed",
        response_payload: parseDelivery(draft.response_payload),
        note: null,
        source: "external_draft",
      };
    } catch {
      // A stored draft that no longer validates is regenerated below.
    }
  }
  const running = draft?.status === "running";
  const fresh = running && now - Date.parse(draft!.created_at) < DRAFT_STALE_MS;
  if (running && fresh) {
    return pending(
      "Your governed result is not the requested output. Writing an unverified draft…",
      {
        engine_label: DRAFT_LABEL,
      },
    );
  }
  const failed = (message: string): ResolvedDelivery => ({
    ...draftBase,
    status: "completed",
    response_payload: governed,
    error: `The external result engine failed: ${message}`,
    note: null,
    source: "governed",
  });
  // Production ENGAGE uses Lovable's built-in AI gateway when its managed
  // project key is present. That keeps the answer path hosted and independent
  // of the operator's Windows worker. Z.AI remains opt-in; local Ollama is only
  // used when LOCAL_LLM_BASE_URL is explicitly configured.
  if (!args.generate && !hasLovableAi && !hasExplicitLocal && !hasOptInZai) {
    if (!TERMINAL_STATUSES.has(run.status))
      return pending("ASCENSION is preparing your answer.", {
        engine_label: DRAFT_LABEL,
      });
    return {
      ...base,
      status: "completed",
      response_payload:
        governed ??
        parseDelivery({
          kind: "not_produced",
          title: run.objective.slice(0, 200) || "ASCENSION result",
          body: notProducedMessage(assessResult(run.objective, "", []).kind),
          files: [],
          limitations: [],
        }),
      error:
        draft?.error ?? "No hosted answer engine is available. Enable Lovable AI for this project.",
      note: null,
      source: "governed",
    };
  }

  if (draft?.status === "failed" && sameSource && !retry)
    return failed(draft.error ?? "unknown error");

  const claimed = await store.claim(sourceKey, draft ? draft.created_at : null);
  if (!claimed) {
    return pending("An unverified draft is being prepared…", { engine_label: DRAFT_LABEL });
  }
  try {
    const produced = await generate(run, files);
    await store.complete(sourceKey, produced);
    return {
      ...draftBase,
      created_at: new Date(now).toISOString(),
      status: "completed",
      response_payload: produced,
      note: null,
      source: "external_draft",
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await store.fail(sourceKey, message).catch(() => undefined);
    return failed(message);
  }
}

/** Signed-in path: stage writes go through the server-only admin client. */
export async function adminDraftStore(runId: string): Promise<DraftStore> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = () => supabaseAdmin.from("ascension_run_stages");
  return {
    async claim(sourceKey, expectedCreatedAt) {
      if (expectedCreatedAt === null) {
        const { error } = await table().insert({
          request_id: runId,
          ordinal: DRAFT_ORDINAL,
          stage: "external_result",
          engine_label: DRAFT_LABEL,
          status: "running",
          request_payload: { source_key: sourceKey, attempts: 1 },
        });
        if (error?.code === "23505") return false;
        if (error) throw new Error(error.message);
        return true;
      }
      const stale = new Date(Date.now() - DRAFT_STALE_MS).toISOString();
      const { data, error } = await table()
        .update({
          status: "running",
          error: null,
          response_payload: null,
          response_text: null,
          completed_at: null,
          created_at: new Date().toISOString(),
          request_payload: { source_key: sourceKey },
        })
        .eq("request_id", runId)
        .eq("ordinal", DRAFT_ORDINAL)
        .eq("created_at", expectedCreatedAt)
        .or(`status.neq.running,created_at.lt.${stale}`)
        .select("id");
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) === 1;
    },
    async complete(sourceKey, payload) {
      const { error } = await table()
        .update({
          status: "completed",
          response_payload: payload as unknown as Json,
          response_text: payload.body,
          engine_model: "external",
          completed_at: new Date().toISOString(),
        })
        .eq("request_id", runId)
        .eq("ordinal", DRAFT_ORDINAL)
        .eq("status", "running")
        .eq("request_payload->>source_key", sourceKey);
      if (error) throw new Error(error.message);
    },
    async fail(sourceKey, message) {
      const { error } = await table()
        .update({
          status: "failed",
          error: message.slice(0, 2000),
          completed_at: new Date().toISOString(),
        })
        .eq("request_id", runId)
        .eq("ordinal", DRAFT_ORDINAL)
        .eq("status", "running")
        .eq("request_payload->>source_key", sourceKey);
      if (error) throw new Error(error.message);
    },
  };
}
