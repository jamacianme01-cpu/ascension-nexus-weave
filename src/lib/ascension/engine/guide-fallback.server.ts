/**
 * Resilient user-facing fallback when every external answer provider fails.
 * Presentation only — never claims governed verification, physical execution,
 * or that a simulation/test occurred.
 */
import { parseDelivery, requestedKind, type ObjectiveDelivery } from "../result-model";

function isDesignStyle(objective: string): boolean {
  const o = objective.toLowerCase();
  return /\b(make|design|invent|build|create|prototype|engineer|develop|construct)\b/.test(o);
}

function subjectHint(objective: string): string {
  const cleaned = objective
    .replace(/^\s*(please\s+)?(make|design|invent|build|create|prototype|engineer|develop|construct)\s+/i, "")
    .replace(/[.?!]+$/, "")
    .trim();
  return cleaned.slice(0, 80) || "the requested system";
}

/**
 * Returns a complete ObjectiveDelivery that the UI can render immediately.
 * Always labelled as an unverified draft. Prefer real engine output when available.
 */
export function buildGuideFallbackDelivery(objective: string): ObjectiveDelivery {
  const subject = subjectHint(objective);
  const design = isDesignStyle(objective);

  // A software build request is an artifact request. Never substitute the
  // canned physical-drone guide pathways for missing runnable app code.
  if (requestedKind(objective) === "app") {
    return parseDelivery({
      kind: "not_produced",
      title: objective.slice(0, 200) || "ASCENSION app result",
      body: [
        "The requested app has not been created.",
        `Objective: ${objective.trim()}`,
        "No runnable source files, application package, or live app were returned.",
        "The connected answer provider is unavailable and the governed builder has not supplied an app artifact.",
        "The objective remains unfinished. A retry can be made after the active answer provider or builder is restored.",
      ].join("\n\n"),
      pathways: [],
      blend: null,
      files: [],
      limitations: [
        "No application source code or runnable artifact was produced.",
        "This is a failure status, not an ASCENSION-generated application.",
      ],
    });
  }

  if (!design) {
    return parseDelivery({
      kind: "answer",
      title: objective.slice(0, 200) || "ASCENSION response",
      body: [
        `I am still with you on this. The usual answer engines are temporarily unavailable, so here is a grounded draft while they recover.`,
        ``,
        `Objective: ${objective.trim()}`,
        ``,
        `I cannot reach the full Knowledgeverse retrieval and pathway engines right now. When the providers return, I will expand this with richer pathways, Outcome Predictor context, and any governed results that become available.`,
        ``,
        `For now: restate or refine the objective if you want a different angle, or try ENGAGE again in a moment.`,
      ].join("\n"),
      pathways: [],
      blend: null,
      files: [],
      limitations: [
        "Unverified draft produced while answer providers were unavailable.",
        "No governed runtime verification or persistence occurred for this response.",
      ],
    });
  }

  const path1 = {
    id: "path-mobility",
    label: "Mobility-first architecture",
    summary: `Prioritize independent movement and terrain adaptability for ${subject}. Each unit carries its own sensing, power, and basic task payload so the system keeps working even when coordination drops.`,
    steps: [
      `Define the primary mobility mode (wheeled, tracked, or hybrid) that matches the expected operating environment for ${subject}.`,
      "Specify onboard power, sensing, and a minimal local controller so a single unit can complete a useful task alone.",
      "Establish a lightweight status channel for optional coordination without making it mandatory for basic operation.",
      "Prototype one unit, verify basic navigation and task execution, then scale unit count.",
    ],
    tradeoffs: [
      "Higher per-unit cost and complexity.",
      "Coordination benefits are optional rather than inherent.",
      "Strong resilience when links or teammates fail.",
    ],
    spiral_form: "mobility_priority",
    visual_svg: null,
    model_spec: null,
    outcome_score: null,
    outcome_reason: "Relative assessment unavailable without live Outcome Predictor context.",
  };

  const path2 = {
    id: "path-swarm",
    label: "Coordinated team architecture",
    summary: `Treat ${subject} as a coordinated team. Individual units stay simpler; value comes from formation, task sharing, and collective coverage.`,
    steps: [
      "Define a small set of complementary roles (scout, carrier, fixer) rather than identical full-featured units.",
      "Design a reliable coordination layer: task assignment, conflict resolution, and recovery when a unit drops out.",
      "Keep per-unit hardware lean; put shared intelligence in the coordination protocol and a light supervisory node if needed.",
      "Validate with a minimal team of three units before expanding population.",
    ],
    tradeoffs: [
      "Depends on reliable communication and coordination logic.",
      "A coordination failure can degrade the whole team.",
      "Lower cost per unit and strong coverage once the team is stable.",
    ],
    spiral_form: "coordinated_team",
    visual_svg: null,
    model_spec: null,
    outcome_score: null,
    outcome_reason: "Relative assessment unavailable without live Outcome Predictor context.",
  };

  const path3 = {
    id: "path-modular",
    label: "Modular platform architecture",
    summary: `Build ${subject} around a common chassis and swappable mission modules. One base platform supports many jobs by changing tools, sensors, or payloads.`,
    steps: [
      "Specify a common mechanical, power, and data interface for mission modules.",
      "Design the base platform for stability, power, and mobility only.",
      "Define two or three initial modules that cover the primary use cases for the objective.",
      "Prove hot-swap or quick-swap of one module, then expand the module library.",
    ],
    tradeoffs: [
      "Interface design is front-loaded work.",
      "A weak interface limits every future module.",
      "Excellent long-term flexibility and reuse across missions.",
    ],
    spiral_form: "modular_platform",
    visual_svg: null,
    model_spec: null,
    outcome_score: null,
    outcome_reason: "Relative assessment unavailable without live Outcome Predictor context.",
  };

  const blend = {
    id: "path-blend",
    label: "Adaptive modular team",
    summary: `Combine a modular base platform with coordinated team behavior and enough per-unit autonomy to keep working when links degrade. Units share a common interface, adopt roles as needed, and fall back to independent operation.`,
    steps: [
      "Adopt the modular chassis and interface from the modular pathway.",
      "Add role-aware coordination so units can specialize without unique airframes.",
      "Keep a minimal local controller on each unit so mobility and a basic task still work offline.",
      "Validate: one unit alone, three coordinated units, then a module swap under light load.",
    ],
    tradeoffs: [
      "More integration work than any single pure pathway.",
      "Best balance of resilience, cost scaling, and mission flexibility for most worker-drone style objectives.",
    ],
    spiral_form: "spiral_outcome_blend",
    visual_svg: null,
    model_spec: null,
    outcome_score: null,
    outcome_reason: "Blend rationale is conceptual until Outcome Predictor context is available.",
    blend_from: ["path-mobility", "path-swarm", "path-modular"],
    blend_reason:
      "Mobility supplies resilience, coordination supplies coverage and efficiency, modularity supplies reuse. The blend keeps a useful floor of independence while enabling team and payload flexibility.",
  };

  return parseDelivery({
    kind: "answer",
    title: objective.slice(0, 200) || "ASCENSION design pathways",
    body: [
      `Welcome back into the Knowledgeverse. ${subject.charAt(0).toUpperCase()}${subject.slice(1)} — clear direction.`,
      ``,
      `The full answer engines are briefly unavailable, so I am giving you a structured draft from the guide layer itself. Three different approaches are below, plus a blend that pulls their strongest elements together.`,
      ``,
      `1. Mobility-first — independent units that keep working when coordination drops.`,
      `2. Coordinated team — simpler units whose value comes from formation and shared work.`,
      `3. Modular platform — one chassis, many mission modules.`,
      ``,
      `The blend (Adaptive modular team) is usually the most practical starting point for worker-style systems. Choose any pathway, combine parts, or tell me what to change and we continue from there.`,
      ``,
      `This is an unverified design draft. Governed verification, AutoSync, and persistence will apply when the runtime path is available again.`,
    ].join("\n"),
    pathways: [path1, path2, path3],
    blend,
    files: [],
    limitations: [
      "Unverified draft produced while answer providers were unavailable.",
      "Pathways are guide-layer design orientations, not governed Spiral or Outcome Predictor output.",
      "No physical build, test, or simulation was performed.",
    ],
  });
}
