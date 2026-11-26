/**
 * Pure preservation of user-facing pathway deliveries actually authored by
 * the original governed ASCENSION core.
 *
 * We never manufacture another route, a BLEND, a model, or dimensions.
 * Other result branches (objective_planning/knowledge forms/receipts) are NOT
 * user-facing delivered solutions.
 */
const record = value => value !== null && typeof value === "object" &&
  !Array.isArray(value) ? value : {};
const text = value => typeof value === "string" ? value.trim() : "";
const authoredId = value => text(record(value).id);

export function selectGovernedAuthoredDelivery(result, originalObjective, artifactFiles) {
  const root = record(result);
  for (const entry of [
    root.objective_delivery, root.delivery, root.response_payload, root,
  ]) {
    const authored = record(entry);
    if (!Array.isArray(authored.pathways)) continue;
    const pathways = authored.pathways;
    const blend = authored.blend ?? null;
    const actual = [...pathways, ...(blend ? [blend] : [])];

    // V1 has a maximum of three genuine paths plus BLEND, or four
    // directly authored paths. Partial results remain visible as partial.
    if (actual.length > 4) continue;
    // The current owner design accepts a single authored answer without
    // pathways. Require an explicit typed delivery envelope: a root-level
    // planning body, receipt, or unclassified narrative is not a delivery.
    if (!actual.length && (entry === root ||
      !["answer", "recommendation", "artifact"].includes(authored.kind))) continue;
    if (pathways.some(item => !authoredId(item) ||
      !text(record(item).label) || !text(record(item).summary))) continue;
    if (blend && (!authoredId(blend) || !text(record(blend).label) ||
      !text(record(blend).summary) || !text(record(blend).blend_reason))) continue;
    if (new Set(actual.map(authoredId)).size !== actual.length) continue;

    const body = text(authored.body) || text(authored.answer);
    if (!body) continue;
    if (authored.kind === "not_produced") continue;
    return {
      kind: authored.kind ?? "answer",
      title: text(authored.title) || originalObjective,
      body,
      pathways,
      blend,
      files: artifactFiles(authored),
      limitations: Array.isArray(authored.limitations)
        ? authored.limitations : [],
    };
  }
  return null;
}
