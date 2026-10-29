/**
 * Tree of Knowledge preference layer.
 * Learns what the person engages with, skips, and returns to,
 * so ASCENSION's guide can weight suggestions toward their patterns.
 * Reads from published World Model data (Meaning Elements, selections,
 * skipped pathways, lineage events) — never starts from zero.
 * Suggestive, not commanding. Speaks when something shifts.
 */

export type EngagementSignal = {
  kind: "selected" | "skipped" | "returned" | "refined" | "built_on";
  target: string;
  meaningElements: string[];
  at: string;
  objective?: string;
  pathwayId?: string;
  spiralForm?: string;
};

export type PreferenceProfile = {
  favoredMeaningElements: { element: string; weight: number; lastSeen: string }[];
  favoredSpiralForms: { form: string; weight: number; lastSeen: string }[];
  favoredPathwayLabels: { label: string; weight: number; lastSeen: string }[];
  recentObjectives: { text: string; at: string }[];
  quietMoments: number;
  lastSuggestionAt: string | null;
  lastEngagementAt: string | null;
};

const MAX_SIGNALS = 200;
const MAX_PROFILE_ITEMS = 12;
const DECAY = 0.92;

function nowIso(): string {
  return new Date().toISOString();
}

function bump<T extends { weight: number; lastSeen: string }>(
  list: T[],
  key: (item: T) => string,
  match: string,
  weight = 1,
): T[] {
  const idx = list.findIndex((item) => key(item) === match);
  const stamp = nowIso();
  if (idx >= 0) {
    const item = list[idx];
    const updated = { ...item, weight: item.weight * DECAY + weight, lastSeen: stamp };
    const rest = list.filter((_, i) => i !== idx);
    return [updated, ...rest].slice(0, MAX_PROFILE_ITEMS);
  }
  return [{ weight, lastSeen: stamp } as T, ...list].slice(0, MAX_PROFILE_ITEMS);
}

/** Record one engagement signal from the Tree / Book / pathway UI. */
export function recordEngagement(
  store: EngagementSignal[],
  signal: Omit<EngagementSignal, "at">,
): EngagementSignal[] {
  const next = [...store, { ...signal, at: nowIso() }].slice(-MAX_SIGNALS);
  return next;
}

/** Build or refresh a preference profile from recorded signals. */
export function buildProfile(signals: EngagementSignal[]): PreferenceProfile {
  let favoredMeaningElements: PreferenceProfile["favoredMeaningElements"] = [];
  let favoredSpiralForms: PreferenceProfile["favoredSpiralForms"] = [];
  let favoredPathwayLabels: PreferenceProfile["favoredPathwayLabels"] = [];
  const recentObjectives: PreferenceProfile["recentObjectives"] = [];
  let quietMoments = 0;
  let lastSuggestionAt: string | null = null;
  let lastEngagementAt: string | null = null;

  for (const s of signals) {
    lastEngagementAt = s.at;
    if (s.objective) recentObjectives.unshift({ text: s.objective, at: s.at });
    if (s.kind === "selected" || s.kind === "returned" || s.kind === "refined" || s.kind === "built_on") {
      for (const me of s.meaningElements) {
        favoredMeaningElements = bump(favoredMeaningElements, (i) => i.element, me, s.kind === "built_on" ? 2 : 1);
      }
      if (s.spiralForm) {
        favoredSpiralForms = bump(favoredSpiralForms, (i) => i.form, s.spiralForm);
      }
      if (s.pathwayId) {
        favoredPathwayLabels = bump(favoredPathwayLabels, (i) => i.label, s.pathwayId);
      }
    } else if (s.kind === "skipped") {
      quietMoments += 1;
    }
  }

  return {
    favoredMeaningElements: favoredMeaningElements.slice(0, MAX_PROFILE_ITEMS),
    favoredSpiralForms: favoredSpiralForms.slice(0, MAX_PROFILE_ITEMS),
    favoredPathwayLabels: favoredPathwayLabels.slice(0, MAX_PROFILE_ITEMS),
    recentObjectives: recentObjectives.slice(0, 8),
    quietMoments,
    lastSuggestionAt,
    lastEngagementAt,
  };
}

/**
 * Decide whether the Tree should speak now.
 * Suggestive: fires on shifts (new selection, new objective, stall after quiet),
 * stays silent between them.
 */
export function shouldSuggest(
  profile: PreferenceProfile,
  opts: { sinceLastEngagementMs?: number; minQuietMs?: number } = {},
): boolean {
  const minQuiet = opts.minQuietMs ?? 45_000;
  if (!profile.lastEngagementAt) return false;
  const elapsed = Date.now() - new Date(profile.lastEngagementAt).getTime();
  if (elapsed < minQuiet) return false;
  // After a stretch of skips with no engagement, hold back harder.
  if (profile.quietMoments >= 3 && elapsed < minQuiet * 2) return false;
  return true;
}

/**
 * Compose a short, suggestive line weighted by the profile.
 * Never commands. Offers one angle the person hasn't tried.
 */
export function composeSuggestion(
  profile: PreferenceProfile,
  context: { objective?: string; availablePathways?: string[] } = {},
): string | null {
  if (!shouldSuggest(profile)) return null;

  const topME = profile.favoredMeaningElements[0];
  const topForm = profile.favoredSpiralForms[0];
  const recent = profile.recentObjectives[0];

  if (topME && context.availablePathways?.length) {
    const untaken = context.availablePathways.find(
      (p) => !profile.favoredPathwayLabels.some((f) => f.label === p),
    );
    if (untaken) {
      return `You've been drawn to ${topME.element.toLowerCase()} lately. There's an angle on ${untaken} you haven't tried — want to see it?`;
    }
  }

  if (topForm && recent) {
    return `Your last few directions leaned ${topForm.form.replace(/_/g, " ")}. If you want a different way in on ${recent.text.slice(0, 60)}, I can surface one.`;
  }

  if (recent && profile.quietMoments >= 2) {
    return `Still with you on ${recent.text.slice(0, 60)}. No rush — when you're ready, there's a thread worth pulling.`;
  }

  return null;
}
