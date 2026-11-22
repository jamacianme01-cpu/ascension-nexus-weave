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
export function governedVoiceCommand(words: string): boolean;
export function choiceForVoiceCommand(words: string, choices: readonly CrystalGovernedChoice[]): number;
export function crystalHasPendingModels(choices: readonly CrystalGovernedChoice[]): boolean;
export function reconcileCrystalMedia(
  original: CrystalGovernedChoice[],
  later: readonly CrystalGovernedChoice[],
): CrystalGovernedChoice[];
