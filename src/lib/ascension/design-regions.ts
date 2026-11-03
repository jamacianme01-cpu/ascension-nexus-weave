/** Image-grounded outlines are visual estimates, never mesh identities or measurements. */
export type DesignRegion = { part: number; polygon: [number, number][] };
export function parseDesignRegions(value: unknown, partCount: number): DesignRegion[] {
  const regions = value && typeof value === "object" ? (value as { regions?: unknown }).regions : null;
  if (!Array.isArray(regions)) throw new Error("No image locations were returned.");
  return regions.slice(0, 24).flatMap((raw): DesignRegion[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    if (!Number.isInteger(r['part']) || Number(r['part']) < 0 || Number(r['part']) >= partCount || typeof r['confidence'] !== "number" || !Number.isFinite(r['confidence']) || r['confidence'] < .85 || r['confidence'] > 1 || !Array.isArray(r['polygon']) || r['polygon'].length < 3 || r['polygon'].length > 24) return [];
    if (!r['polygon'].every(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1))) return [];
    const polygon = r['polygon'] as [number, number][];
    const area = Math.abs(polygon.reduce((sum, [x,y], i) => { const next = polygon[(i+1)%polygon.length]!; return sum + x*next[1]-next[0]*y; }, 0))/2;
    if (area < .00005 || area > .6) return [];
    return [{part: Number(r['part']), polygon}];
  });
}
