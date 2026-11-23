import type { ObjectiveDelivery } from "./result-model";
export interface CrystalGovernedChoice {
  id: string;
  /** True only when an actual delivered source BLEND occupies this slot. */
  isBlend?: boolean;
  title: string;
  body: string;
  design: {
    title: string;
    summary: string;
    imageUrl: string | null;
    blueprintUrl: string | null;
    modelUrl: string | null;
  } | null;
  parts: Array<{name: string; location: string; purpose: string}>;
  limitations: string[];
  modelStatus: "queued" | "claimed" | "running" | "completed" | "failed" | null;
}
export function deliveredCrystalChoices(delivery: ObjectiveDelivery | null): CrystalGovernedChoice[];
/** Explicit owner voice authorization bundled with a new intent; never matches plain intent. */
export function explicitlyEngagedIntent(words: string): string | null;
export function governedVoiceCommand(words: string): boolean;
export function choiceForVoiceCommand(words: string, choices: readonly CrystalGovernedChoice[]): number;
export function crystalHasPendingModels(choices: readonly CrystalGovernedChoice[]): boolean;
export function reconcileCrystalMedia(
  original: CrystalGovernedChoice[],
  later: readonly CrystalGovernedChoice[],
): CrystalGovernedChoice[];
/** Return the actually recorded continuing result index; never fabricate a provider or design. */
export function evolvingCrystalResultIndex(
  choices: readonly CrystalGovernedChoice[],
  recordedIndex?: number | null,
): number;
