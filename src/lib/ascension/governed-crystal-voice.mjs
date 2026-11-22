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
