/**
 * Pure, voice-first projection of an ACTUALLY returned governed ASCENSION result.
 * No synthetic pathways, artwork, model geometry, or physical measurements.
 * Nothing in this module submits or stores the user's original intention.
 */
export function deliveredCrystalChoices(delivery) {
  if (!delivery || delivery.kind === "not_produced" ||
      typeof delivery.body !== "string" || !delivery.body.trim()) return [];
  const realFour = delivery.pathways?.length === 3 && delivery.blend &&
    new Set([...delivery.pathways, delivery.blend].map(item => item.id)).size === 4;
  const actual = realFour
    ? [...delivery.pathways, delivery.blend]
    : delivery.blend ? [delivery.blend]
      : delivery.pathways?.length ? [...delivery.pathways] : [];
  if (!actual.length) return [{
    id: "governed-single-output",
    title: delivery.title,
    body: delivery.body,
    design: null,
    parts: [],
    modelStatus: null,
    limitations: delivery.limitations ?? [],
  }];
  return actual.map((choice, index) => {
    const parts = (choice.model_spec?.parts ?? []).map(part => ({
      name: part.name,
      location: part.location ?? "",
      purpose: part.purpose ?? "",
    }));
    const imageUrl = choice.generated_image_url ?? null;
    const blueprintUrl = choice.generated_blueprint_url ?? null;
    const modelUrl = choice.model_url ?? null;
    return {
      id: choice.id,
      title: choice.label || delivery.title,
      body: choice.summary || delivery.body,
      design: imageUrl || blueprintUrl || modelUrl ? {
        title: choice.label || delivery.title,
        summary: choice.summary || delivery.body,
        imageUrl, blueprintUrl, modelUrl,
      } : null,
      parts,
      modelStatus: choice.model_status ?? null,
      limitations: delivery.limitations ?? [],
    };
  });
}
export function governedVoiceCommand(words) {
  const normalized = String(words || "").trim().toLowerCase()
    .replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
  return /^(?:run (?:my |this |the )?(?:intent |crystal |design )?(?:through |with )?ascension(?:'s)? (?:own )?engines|engage ascension(?: engines)?|run ascension(?:'s)? engines|use ascension(?:'s)? engines)$/.test(normalized);
}
export function choiceForVoiceCommand(words, choices) {
  if (!Array.isArray(choices) || !choices.length) return -1;
  const text = String(words || "").trim().toLowerCase()
    .replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
  const match = text.match(/^(?:choose|select|open|enter|show|inspect) (?:pathway )?(.+)$/);
  if (!match) return -1;
  const phrase = match[1];
  const positions = { one:0,two:1,three:2,four:3,"1":0,"2":1,"3":2,"4":3,first:0,second:1,third:2,fourth:3 };
  const position = positions[phrase];
  if (position !== undefined) return position < choices.length ? position : -1;
  if (phrase === "blend") {
    if (choices.length === 4) return 3; // Only a recorded 3 + blend delivery earns this slot.
    const found = choices.findIndex(c => /\bblend\b/i.test(c.title));
    return found < 0 ? -1 : found;
  }
  const names = choices.map(c => String(c.title).toLowerCase());
  const matched = names.map((name,i) =>
    name === phrase || name.startsWith(phrase + " ") || name.includes(" " + phrase + " ")
      ? i : -1).filter(i => i >= 0);
  return matched.length === 1 ? matched[0] : -1;
}


const pendingModels = new Set(["queued", "claimed", "running"]);
export function crystalHasPendingModels(choices) {
  return choices.some(choice =>
    pendingModels.has(choice.modelStatus) && !choice.design?.modelUrl);
}
/**
 * The same authorized governed request may later deliver its queued GLB.
 * Only append real missing assets; never overwrite existing original wording,
 * images, dimensions or selected pathway identity.
 */
export function reconcileCrystalMedia(original, later) {
  if (!Array.isArray(original) || !Array.isArray(later) ||
      original.length !== later.length) return original;
  if (original.some((choice,i) =>
    choice.id !== later[i]?.id || choice.title !== later[i]?.title ||
    choice.body !== later[i]?.body)) return original;
  let updated = false;
  const merged = original.map((choice,i) => {
    const next=later[i];
    const earlier=choice.design;
    const newer=next.design;
    const imageUrl=earlier?.imageUrl ?? newer?.imageUrl ?? null;
    const blueprintUrl=earlier?.blueprintUrl ?? newer?.blueprintUrl ?? null;
    const modelUrl=earlier?.modelUrl ?? newer?.modelUrl ?? null;
    const statusPriority={queued:1,claimed:2,running:3,completed:4,failed:4};
    const modelStatus=(statusPriority[next.modelStatus] ?? 0) >=
      (statusPriority[choice.modelStatus] ?? 0)
      ? next.modelStatus : choice.modelStatus;
    const change=imageUrl !== (earlier?.imageUrl ?? null) ||
      blueprintUrl !== (earlier?.blueprintUrl ?? null) ||
      modelUrl !== (earlier?.modelUrl ?? null) ||
      modelStatus !== choice.modelStatus;
    if (!change) return choice;
    updated=true;
    return {...choice,modelStatus,
      design:imageUrl || blueprintUrl || modelUrl
        ? {title:choice.title,summary:choice.body,imageUrl,blueprintUrl,modelUrl}
        : null};
  });
  return updated ? merged : original;
}
