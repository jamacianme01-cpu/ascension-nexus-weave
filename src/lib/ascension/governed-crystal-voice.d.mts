import type { ObjectiveDelivery } from "./result-model";
export interface CrystalGovernedChoice {
  id: string;
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
}
export function deliveredCrystalChoices(delivery: ObjectiveDelivery | null): CrystalGovernedChoice[];
export function governedVoiceCommand(words: string): boolean;
export function choiceForVoiceCommand(words: string, choices: readonly CrystalGovernedChoice[]): number;
