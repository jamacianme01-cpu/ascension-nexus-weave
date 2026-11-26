/**
 * Pure, voice-first projection of an ACTUALLY returned governed ASCENSION result.
 * No synthetic pathways, artwork, model geometry, or physical measurements.
 * Nothing in this module submits or stores the user's original intention.
 */
export function deliveredCrystalChoices(delivery) {
  if (!delivery || delivery.kind === "not_produced" ||
      typeof delivery.body !== "string" || !delivery.body.trim()) return [];
  const pathways = Array.isArray(delivery.pathways) ? delivery.pathways : [];
  // Preserve genuine partial deliveries. Previously, 1–2 genuine pathways
  // disappeared whenever a real BLEND accompanied them.
  // Do not invent a fifth result or a duplicate identity.
  const appendBlend = Boolean(
    delivery.blend && pathways.length < 4 &&
    !pathways.some(path => path.id === delivery.blend.id)
  );
  const actual = appendBlend
    ? [...pathways, delivery.blend]
    : [...pathways];
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
    const recordedBlendId = typeof delivery.blend?.id === "string" &&
      delivery.blend.id.trim() ? delivery.blend.id : null;
    return {
      id: choice.id,
      // A BLEND can already be in the original source pathways. Preserve its
      // genuine identity without creating a duplicate or a synthetic slot.
      isBlend: Boolean((appendBlend && index === pathways.length) ||
        (recordedBlendId && choice.id === recordedBlendId)),
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
/** A single spoken instruction can explicitly authorize ONE governed intent.
 * Plain speech remains device-private; no invented response or new pathway.
 */
export function explicitlyEngagedIntent(words) {
  const raw = String(words || "").trim();
  // Speech recognizers often omit punctuation after "Engage ASCENSION".
  // Accept a clearly spoken action/request without requiring a comma, while
  // rejecting bare ENGAGE or unrelated words as remote-upload permission.
  const match = raw.match(/^(?:engage\s+ascension(?:\s+engines)?|run\s+ascension(?:'s)?\s+engines)(?:\s*[,;:.]\s*|\s+(?:to\s+)?(?=(?:i|we|design|create|build|make|develop|invent|improve|explore|explain|fix|repair|produce|generate|show|plan|research|analyze|help)\b))(\S[\s\S]*)$/i);
  return match ? match[1].trim() : null;
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
  const phrase = match[1].replace(/^the /, "").replace(/ pathway$/, "");
  const positions = { one:0,two:1,three:2,four:3,"1":0,"2":1,"3":2,"4":3,first:0,second:1,third:2,fourth:3 };
  const position = positions[phrase];
  if (position !== undefined) return position < choices.length ? position : -1;
  if (phrase === "blend") {
    const marked = choices.findIndex(c => c.isBlend === true);
    if (marked >= 0) return marked;
    // Legacy encrypted receipts predate explicit BLEND provenance.
    if (choices.length === 4 && choices.every(c => c.isBlend === undefined)) return 3;
    const found = choices.findIndex(c => /\bblend\b/i.test(c.title));
    return found < 0 ? -1 : found;
  }
  // Engine IDs are stable recorded identities; the spoken model names must
  // still work when an engine supplies a descriptive, non-provider title.
  const matched = choices.map((choice,i) => {
    const name = String(choice.title || "").toLowerCase();
    const id = String(choice.id || "").toLowerCase();
    return id === phrase || name === phrase ||
      name.startsWith(phrase + " ") || name.includes(" " + phrase + " ")
      ? i : -1;
  }).filter(i => i >= 0);
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

/**
 * The active V1 Tree reveals ONE continuing result, never a provider chooser.
 * Prefer an already owner-selected, recorded answer on recall; otherwise use
 * the original runtime's actual BLEND when present, or its first real output.
 * This chooses among genuine returned data and does not synthesize a result.
 */
export function evolvingCrystalResultIndex(choices, recordedIndex = null) {
  if (!Array.isArray(choices) || !choices.length) return -1;
  const usable = index => typeof choices[index]?.body === "string" &&
    Boolean(choices[index].body.trim());
  if (Number.isInteger(recordedIndex) && recordedIndex >= 0 &&
      recordedIndex < choices.length && usable(recordedIndex)) return recordedIndex;
  const blend = choices.findIndex((choice, index) =>
    choice?.isBlend === true && usable(index));
  if (blend !== -1) return blend;
  return choices.findIndex((_, index) => usable(index));
}
