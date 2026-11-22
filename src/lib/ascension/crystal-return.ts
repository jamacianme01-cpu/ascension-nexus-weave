/**
 * Verified growth since the owner last viewed a crystal in this Library Card.
 * Only persisted governed revision counts qualify; queued jobs are not progress.
 */
export type CrystalGrowth = { id: string; verifiedGrowthCount: number };
export type SeenGrowth = Record<string, number>;

function validCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function parseSeenGrowth(raw: string | null): SeenGrowth {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const entries = Object.entries(value).filter(([id, count]) =>
      /^[a-f0-9-]{36}$/i.test(id) && validCount(count) === count
    ).slice(-128);
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function newlyVerifiedCount(crystal: CrystalGrowth, seen: SeenGrowth): number {
  const total = validCount(crystal.verifiedGrowthCount);
  const prior = validCount(seen[crystal.id]);
  return Math.max(0, total - prior);
}

export function pendingGrowthSummary(crystals: CrystalGrowth[], seen: SeenGrowth) {
  const progressed = crystals.filter(crystal => newlyVerifiedCount(crystal, seen) > 0);
  return {
    crystalCount: progressed.length,
    revisionCount: progressed.reduce((sum, crystal) => sum + newlyVerifiedCount(crystal, seen), 0),
  };
}

export function markGrowthSeen(crystal: CrystalGrowth, seen: SeenGrowth): SeenGrowth {
  return { ...seen, [crystal.id]: Math.max(
    validCount(seen[crystal.id]),
    validCount(crystal.verifiedGrowthCount),
  ) };
}

export function describeNewGrowth(revisions: number): string {
  if (revisions <= 0) return "";
  return revisions === 1
    ? "Since you last viewed this intent, one newly verified development has been recorded. "
    : `Since you last viewed this intent, ${revisions} newly verified developments have been recorded. `;
}

export function welcomeBackGrowth(crystals: number, revisions: number): string {
  if (!crystals || !revisions) {
    return "Welcome to ASCENSION. I'm your groundskeeper and guide. Speak your intent, or ask me to retrieve one you've already grown.";
  }
  return `Welcome back to ASCENSION. ${crystals} of your intent crystals have ${revisions} newly verified developments since you last viewed them. Ask me to retrieve a crystal, or speak a new intent.`;
}
