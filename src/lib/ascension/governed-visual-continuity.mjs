/**
 * The authorized ASCENSION result remains the source of the Tree's picture,
 * measured blueprint, and actual GLB. Never substitute a stock image or
 * promote an unverified model to a physical measurement.
 *
 * Pure mapping and additive delayed-media reconciliation, no remote requests.
 */
const pending = new Set(["queued", "claimed", "running"]);
const ranks = { queued: 1, claimed: 2, running: 3, completed: 4, failed: 4 };

export function singleDeliveredResult(delivery) {
  const real = delivery.blend ?? delivery.pathways?.[0] ?? null;
  const parts = real?.model_spec?.parts?.map(part => ({
    name: part.name,
    purpose: part.purpose ?? "",
    location: part.location ?? "",
  })) ?? [];
  return {
    introduction: delivery.body,
    pathways: [],
    blend: {
      id: real?.id ?? "governed-single-output",
      title: real?.label || delivery.title,
      summary: real?.summary || delivery.body,
      steps: real?.steps ?? [],
      tradeoffs: real?.tradeoffs ?? delivery.limitations,
      parts,
      imageUrl: real?.generated_image_url ?? null,
      blueprintUrl: real?.generated_blueprint_url ?? null,
      modelUrl: real?.model_url ?? null,
      modelStatus: real?.model_status ?? null,
      blend_reason: delivery.blend?.blend_reason ?? "",
    },
    files: delivery.files,
  };
}
export function waitingOnDeliveredModels(result) {
  if (!result) return false;
  return [...result.pathways, result.blend].some(path =>
    !path.modelUrl && pending.has(path.modelStatus),
  );
}
function reconcilePath(previous, next) {
  // Reject a different design under the same temporary token. Actual original
  // text, component descriptions and the initial received image are retained.
  if (previous.id !== next.id ||
      previous.title !== next.title ||
      previous.summary !== next.summary) return null;
  const nextStatus = ranks[next.modelStatus] ?? 0;
  const oldStatus = ranks[previous.modelStatus] ?? 0;
  const modelStatus = nextStatus >= oldStatus
    ? (next.modelStatus ?? previous.modelStatus ?? null)
    : (previous.modelStatus ?? null);
  const values = {
    imageUrl: previous.imageUrl ?? next.imageUrl ?? null,
    blueprintUrl: previous.blueprintUrl ?? next.blueprintUrl ?? null,
    modelUrl: previous.modelUrl ?? next.modelUrl ?? null,
    modelStatus,
  };
  if (Object.entries(values).every(([key, value]) => previous[key] === value)) return previous;
  return {...previous, ...values};
}
/** Add only later, actual media belonging to this exact authorized run. */
export function reconcileDeliveredVisuals(current, next) {
  if (!current || !next ||
      current.introduction !== next.introduction ||
      current.pathways.length !== next.pathways.length) return current;
  const pathways = [];
  for (let i=0;i<current.pathways.length;i++) {
    const merged = reconcilePath(current.pathways[i],next.pathways[i]);
    if (!merged) return current;
    pathways.push(merged);
  }
  const blend = reconcilePath(current.blend,next.blend);
  if (!blend) return current;
  if (blend === current.blend &&
      pathways.every((path,i)=>path===current.pathways[i])) return current;
  return {...current,pathways,blend};
}
