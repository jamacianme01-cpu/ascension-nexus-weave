import type { CrystalGovernedChoice } from "./governed-crystal-voice.mjs";

export interface GovernedCrystalReceipt {
  source: "governed";
  requestId: string;
  guestToken: string;
  receivedAt: string;
  selectedIndex: number | null;
  choices: CrystalGovernedChoice[];
}
export function validateGovernedReceipt(value: unknown): GovernedCrystalReceipt;
export function validateGovernedHistory(value: unknown): GovernedCrystalReceipt[];
export function mergeGovernedHistory(
  existing: readonly GovernedCrystalReceipt[] | undefined,
  additions: readonly GovernedCrystalReceipt[] | undefined,
): GovernedCrystalReceipt[];
export function markGovernedSelection(
  history: readonly GovernedCrystalReceipt[] | undefined,
  requestId: string, selectedIndex: number,
): GovernedCrystalReceipt[];
