/**
 * Canonical stage chain for a hosted Z.AI execution run.
 *
 * Client-safe: names and labels only, no engine access. The web layer shows
 * these labels so external engine output is never mistaken for ASCENSION
 * governed state.
 */

export const EPISTEMIC_LABELS = {
  external: "ZAI_EXTERNAL_RESULT",
  pending: "ZAI_VERIFICATION_PENDING",
  verified: "ZAI_VERIFIED_EXTERNAL_RESULT",
  rejected: "ZAI_REJECTED_EXTERNAL_RESULT",
  persisted: "ASCENSION_VERIFIED_PERSISTED",
} as const;

export type EpistemicLabel = (typeof EPISTEMIC_LABELS)[keyof typeof EPISTEMIC_LABELS];

export const EPISTEMIC_LABEL_TEXT: Record<string, string> = {
  ZAI_EXTERNAL_RESULT: "Z.AI · EXTERNAL RESULT",
  ZAI_VERIFICATION_PENDING: "Z.AI · VERIFICATION PENDING",
  ZAI_VERIFIED_EXTERNAL_RESULT: "Z.AI · VERIFIED EXTERNAL RESULT",
  ZAI_REJECTED_EXTERNAL_RESULT: "Z.AI · REJECTED EXTERNAL RESULT",
  ASCENSION_VERIFIED_PERSISTED: "ASCENSION · VERIFIED / PERSISTED",
};

export interface StageSpec {
  ordinal: number;
  stage: string;
  title: string;
  label: EpistemicLabel;
}

export const STAGE_CHAIN: readonly StageSpec[] = [
  { ordinal: 1, stage: "me_decomposition", title: "Meaning Element decomposition", label: EPISTEMIC_LABELS.external },
  { ordinal: 2, stage: "dtf_branches", title: "DTF branch generation", label: EPISTEMIC_LABELS.external },
  { ordinal: 3, stage: "branch_evaluation", title: "Branch evaluation", label: EPISTEMIC_LABELS.external },
  { ordinal: 4, stage: "guardian_review", title: "Guardian review", label: EPISTEMIC_LABELS.pending },
  { ordinal: 5, stage: "selection", title: "Selection", label: EPISTEMIC_LABELS.external },
  { ordinal: 6, stage: "execution", title: "Execution reasoning", label: EPISTEMIC_LABELS.external },
  { ordinal: 7, stage: "autosync_verification", title: "AutoSync verification", label: EPISTEMIC_LABELS.pending },
  { ordinal: 8, stage: "delta", title: "Δ statement", label: EPISTEMIC_LABELS.verified },
] as const;

export const STAGE_TITLES: Record<string, string> = Object.fromEntries(
  STAGE_CHAIN.map((spec) => [spec.stage, spec.title]),
);

export const TOTAL_STAGES = STAGE_CHAIN.length;
