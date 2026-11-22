import type { ObjectiveDelivery } from "./result-model";

export interface VisiblePart {
  name: string;
  purpose: string;
  location: string;
}
export interface VisiblePathway {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  tradeoffs: string[];
  parts: VisiblePart[];
  imageUrl: string | null;
  blueprintUrl: string | null;
  modelUrl: string | null;
  modelStatus?: "queued" | "claimed" | "running" | "completed" | "failed" | null;
  blend_reason?: string;
}
export interface VisibleGovernedResult {
  introduction: string;
  pathways: VisiblePathway[];
  blend: VisiblePathway & { blend_reason: string };
  files?: { name: string; content: string }[];
}
export function singleDeliveredResult(delivery: ObjectiveDelivery): VisibleGovernedResult;
export function waitingOnDeliveredModels(result: VisibleGovernedResult | null): boolean;
export function reconcileDeliveredVisuals<T extends VisibleGovernedResult>(
  current: T | null,
  next: VisibleGovernedResult | null,
): T | null;
