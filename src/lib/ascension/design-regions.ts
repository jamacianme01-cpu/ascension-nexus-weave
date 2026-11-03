/** Image-grounded location estimates are not silhouettes or mesh identities. */
export type DesignRegion = { part: number; point: [number, number] };
export function parseDesignRegions(value: unknown, partCount: number): DesignRegion[] {
  const regions = value && typeof value === "object" ? (value as { regions?: unknown }).regions : null;
  if (!Array.isArray(regions)) throw new Error("No image locations were returned.");
  return regions.slice(0,24).flatMap((raw): DesignRegion[] => {
    if (!raw || typeof raw !== "object") return [];
    const r=raw as Record<string,unknown>;
    if(!Number.isInteger(r['part']) || Number(r['part'])<0 || Number(r['part'])>=partCount || typeof r['confidence']!=="number" || !Number.isFinite(r['confidence']) || r['confidence']<.95 || r['confidence']>1) return [];
    const point=r['point'];
    if(!Array.isArray(point)||point.length!==2||!point.every(n=>typeof n==="number"&&Number.isFinite(n)&&n>0&&n<1))return [];
    return [{part:Number(r['part']),point:point as [number,number]}];
  });
}
