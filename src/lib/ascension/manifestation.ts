/**
 * ENVISION manifestation state machine.
 *
 * A pathway reality is never shown finished: it moves possibility →
 * condensation → reveal → stabilized. All timing is expressed in elapsed
 * milliseconds from a sequence start, so the renderer stays deterministic and
 * sound can subscribe to the same phase transitions.
 */

export type ManifestationPhase = "idle" | "possibility" | "condensation" | "reveal" | "stabilized";

/** Phase boundaries in ms: fast energy → deceleration → materialization → calm inspection. */
export const PHASE_BOUNDARY = {
  condensation: 700,
  reveal: 1500,
  stabilized: 2300,
} as const;

export const MANIFESTATION_TOTAL_MS = PHASE_BOUNDARY.stabilized;

export function manifestationPhase(elapsedMs: number): ManifestationPhase {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "idle";
  if (elapsedMs < PHASE_BOUNDARY.condensation) return "possibility";
  if (elapsedMs < PHASE_BOUNDARY.reveal) return "condensation";
  if (elapsedMs < PHASE_BOUNDARY.stabilized) return "reveal";
  return "stabilized";
}

/** Position within the current phase, 0 → 1. Clamped; stabilized reports 1. */
export function phaseProgress(elapsedMs: number): number {
  const phase = manifestationPhase(elapsedMs);
  if (phase === "idle") return 0;
  if (phase === "stabilized") return 1;
  const start =
    phase === "possibility"
      ? 0
      : phase === "condensation"
        ? PHASE_BOUNDARY.condensation
        : PHASE_BOUNDARY.reveal;
  const end =
    phase === "possibility"
      ? PHASE_BOUNDARY.condensation
      : phase === "condensation"
        ? PHASE_BOUNDARY.reveal
        : PHASE_BOUNDARY.stabilized;
  return clamp01((elapsedMs - start) / (end - start));
}

/** Whole-sequence progress 0 → 1. */
export function sequenceProgress(elapsedMs: number): number {
  return clamp01(elapsedMs / MANIFESTATION_TOTAL_MS);
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** Smoothed easing that decelerates into its target — used for convergence. */
export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

/**
 * Assembly spin (radians) at elapsed seconds. Fast controlled rotation in
 * possibility, visible deceleration through condensation/reveal, then only a
 * complete stop once stabilized. Pure so every station and the sound
 * timeline stay in sync.
 */
export function assemblySpin(elapsedSec: number, stationSeed = 0): number {
  const e = Math.max(0, elapsedSec);
  const c = PHASE_BOUNDARY.condensation / 1000;
  const r = PHASE_BOUNDARY.reveal / 1000;
  const s = PHASE_BOUNDARY.stabilized / 1000;
  let theta: number;
  if (e < c) {
    theta = 2.1 * e;
  } else if (e < r) {
    const t = e - c;
    theta = 1.47 + 2.1 * t - t * t; // ω 2.1 → 0.5
  } else if (e < s) {
    const t = e - r;
    theta = 2.51 + 0.5 * t - 0.2625 * t * t; // ω 0.5 → 0.08
  } else {
    theta = 2.742;
  }
  return theta + stationSeed * 0.58;
}

/** Deterministic 0..1 hash for per-part scatter directions and lock order. */
export function partHash(index: number, stationSeed = 0): number {
  const x = Math.sin((index + 1) * 127.1 + stationSeed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Stable unit scatter direction for a part index. */
export function partScatterDir(index: number, stationSeed = 0): [number, number, number] {
  const a = partHash(index, stationSeed) * Math.PI * 2;
  const b = partHash(index + 57, stationSeed) * Math.PI - Math.PI / 2;
  const r = 0.55 + partHash(index + 113, stationSeed) * 0.5;
  const cb = Math.cos(b);
  return [Math.cos(a) * cb * r, Math.sin(b) * r, Math.sin(a) * cb * r];
}

/**
 * When a part locks into its final position during the reveal phase. Parts
 * lock sequentially (staggered by hash) and always finish before stabilized.
 */
export function partLockMs(index: number, stationSeed = 0): number {
  return PHASE_BOUNDARY.reveal + 200 + partHash(index, stationSeed) * 450;
}

export const MANIFESTATION_PHASE_LABEL: Record<ManifestationPhase, string> = {
  idle: "STANDBY",
  possibility: "MANIFESTING · POSSIBILITY",
  condensation: "MANIFESTING · CONDENSATION",
  reveal: "MANIFESTING · STRUCTURAL REVEAL",
  stabilized: "REALITY STABILIZED",
};

/**
 * The user's own linear propulsion details, ONLY when the objective or the
 * retrieved pathway knowledge actually identifies them. Never invented for
 * unrelated objectives — absent matches leave the standard geometry.
 */
export type LinearSpec = {
  volts: number | null;
  coils: number;
  rails: number;
  stasis: boolean;
  piezo: boolean;
  lidar: boolean;
  label: string | null;
};

export function linearSpecFromText(...texts: (string | null | undefined)[]): LinearSpec | null {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (
    !/linear propulsion|linear engine|coil ?gun|rail|railgun|maglev|electromagnetic (rail|acceleration|propulsion)|induction (rail|propulsion)/.test(
      t,
    )
  ) {
    return null;
  }
  const coilMatch = t.match(/(\d{1,2})\s*(?:coils?|electromagnets?)/);
  const railMatch = t.match(/(\d)\s*(?:rails?|tracks?|guideways?)/);
  const voltMatch = t.match(/(\d{1,3})\s*(?:v\b|volts?\b)/);
  const coils = Math.min(12, Math.max(2, coilMatch ? Number(coilMatch[1]) : 3));
  const rails = Math.min(4, Math.max(2, railMatch ? Number(railMatch[1]) : 2));
  const volts = voltMatch ? Math.min(800, Math.max(3, Number(voltMatch[1]))) : null;
  const stasis = /stasis|levitat/.test(t);
  const piezo = /piezo/.test(t);
  const lidar = /lidar|neuro band/.test(t);
  const label = [
    volts !== null ? `${volts} V` : null,
    `${coils} COILS`,
    `${rails} RAILS`,
    stasis ? "STASIS" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { volts, coils, rails, stasis, piezo, lidar, label: label || null };
}
