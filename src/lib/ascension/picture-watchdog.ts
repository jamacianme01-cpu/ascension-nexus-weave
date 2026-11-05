/** Reports a picture generator that stalls, fails, or runs past its time budget. */

export type PictureGenerator = "Grok" | "Free image" | "Image bridge" | "Hunyuan3D";

export const PICTURE_TIME_BUDGET_MS: Record<PictureGenerator, number> = {
  Grok: 12_000,
  "Free image": 45_000,
  "Image bridge": 30_000,
  Hunyuan3D: 20_000,
};

export const PICTURE_FALLBACK: Record<PictureGenerator, string | null> = {
  Grok: "free image generator",
  "Free image": null,
  "Image bridge": null,
  Hunyuan3D: "named-part assembly",
};

export type PictureWatch = {
  generator: PictureGenerator;
  elapsed_ms: number;
  budget_ms: number;
  picture_produced: boolean;
  exceeded_budget: boolean;
  stalled: boolean;
  fallback: string | null;
  message: string;
};

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1).replace(/\.0$/, "");
}

export function judgePictureWatch(input: {
  generator: PictureGenerator;
  elapsedMs: number;
  pictureProduced: boolean;
  stalled?: boolean;
  fallback?: string | null;
  budgetMs?: number;
}): PictureWatch {
  const budget = input.budgetMs ?? PICTURE_TIME_BUDGET_MS[input.generator];
  const elapsed = Math.max(0, Math.round(input.elapsedMs));
  const exceeded = elapsed > budget;
  const stalled = input.stalled === true || (!input.pictureProduced && exceeded);
  const fallback = input.fallback === undefined ? PICTURE_FALLBACK[input.generator] : input.fallback;
  const lead = !input.pictureProduced && stalled
    ? `${input.generator} went quiet after ${seconds(elapsed)} seconds`
    : !input.pictureProduced
      ? `${input.generator} produced no picture after ${seconds(elapsed)} seconds`
      : exceeded
        ? `${input.generator} was slow: ${seconds(elapsed)} seconds`
        : `${input.generator} finished in ${seconds(elapsed)} seconds`;
  const budgetNote = exceeded ? `, past its ${seconds(budget)} second budget` : "";
  const outcome = input.pictureProduced ? " A picture was produced." : " No picture was produced.";
  const next = fallback
    ? ` Fallback: ${fallback}.`
    : input.pictureProduced ? "" : " No further picture fallback.";
  return {
    generator: input.generator,
    elapsed_ms: elapsed,
    budget_ms: budget,
    picture_produced: input.pictureProduced,
    exceeded_budget: exceeded,
    stalled,
    fallback,
    message: `${lead}${budgetNote}.${outcome}${next}`,
  };
}

export function isReportablePictureWatch(watch: PictureWatch): boolean {
  return !watch.picture_produced || watch.exceeded_budget || watch.stalled;
}
