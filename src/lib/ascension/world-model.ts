import type { AscensionState } from "./contracts";
import { record, strings, branchTitle } from "./result-model";

export interface WorldNode {
  id: string;
  persistentId: string | null;
  sid: string | null;
  name: string;
  who: string | null;
  what: string | null;
  why: string | null;
  state: string | null;
  chromosome: Record<string, unknown>;
  genesis: string | null;
  maturity: number | null;
  mes: string[];
  inherited: string[];
  emerged: string[];
  traits: string[];
  constraints: string[];
  environment: string[];
  ancestry: string[];
  events: { at: string | null; transition: string | null; delta: string | null }[];
  delta: { K: number | null; W: number | null; U: number | null };
}
export interface KnowledgeWorld {
  nodes: WorldNode[];
  edges: { id: string; source: string; target: string; label: string }[];
  emergences: {
    id: string;
    property: string;
    capability: string | null;
    status: string | null;
    participants: string[];
  }[];
  futures: { id: string; title: string; actions: string[]; risks: string[]; selected: boolean }[];
  objective: string | null;
  source: "live" | "demo";
  revision: number | null;
}
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);
const number = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Display model only. Every relationship and developmental value is published. */
export function knowledgeWorld(data: AscensionState): KnowledgeWorld {
  if (!data.live) {
    const nodes = Object.entries(data.entities).map(([id, e]): WorldNode => ({
      id,
      persistentId: e.entity_id ?? id,
      sid: e.sid ?? null,
      name: e.operator_label ?? id,
      who: null,
      what: null,
      why: e.destiny ?? null,
      state: null,
      chromosome: record(e.chromosome),
      genesis: null,
      maturity: null,
      mes: e.me_ids ?? [],
      inherited: [],
      emerged: [],
      traits: [],
      constraints: [],
      environment: [],
      ancestry: [],
      events: (e.lineage ?? []).map((t) => ({ at: null, transition: t, delta: null })),
      delta: { K: e.delta?.K ?? null, W: e.delta?.W ?? null, U: e.delta?.U ?? null },
    }));
    return {
      nodes,
      edges: (data.worldModel.relationships ?? []).map((r, i) => ({
        id: `fixture-${i}`,
        source: r.a,
        target: r.b,
        label: r.kind ?? "relationship",
      })),
      emergences: [],
      futures: [],
      objective: data.chamber.destiny ?? null,
      source: "demo",
      revision: null,
    };
  }
  const live = data.live;
  const governed = record(live.governedState);
  const cards = record(governed["library_cards"]);
  const kv = record(governed["knowledgeverse"]);
  const chromosomes = record(kv["chromosomes"]);
  const edges = new Map<string, KnowledgeWorld["edges"][number]>();
  const nodes = live.forms.map((form): WorldNode => {
    const card = record(cards[form.entity_id]);
    const chr = record(chromosomes[String(form.chromosome["chromosome_id"])]);
    const delta = record(form.verified_delta["summary"]);
    if (Array.isArray(form.key_relationships))
      for (const raw of form.key_relationships) {
        const r = record(raw);
        const source = text(r["source"]),
          target = text(r["target"]);
        if (!source || !target) continue;
        const id = text(r["relationship_id"]) ?? `${source}:${target}:${r["relation_type"]}`;
        edges.set(id, { id, source, target, label: text(r["relation_type"]) ?? "relationship" });
      }
    const events = form.lineage["events"];
    return {
      id: form.entity_id,
      persistentId: form.persistent_entity_id,
      sid: form.sid,
      name: text(card["who"])?.replace(/_/g, " ") ?? text(card["name"]) ?? form.entity_id,
      who: text(card["who"]),
      what: text(card["what"]),
      why: text(card["current_purpose"]) ?? text(card["why"]),
      state: form.developmental_state,
      chromosome: Object.keys(chr).length ? chr : record(form.chromosome),
      genesis: text(form.chromosome["genesis_type"]),
      maturity: number(form.phenotype["maturity"]),
      mes: strings(form.active_meaning_elements),
      inherited: strings(card["inherited_traits"]),
      emerged: strings(card["emerged_traits"]),
      traits: strings(form.phenotype["expression_descriptors"]),
      constraints: strings(card["constraints"]),
      environment: strings(card["environmental_influences"]),
      ancestry: strings(form.lineage["ancestry"]),
      events: Array.isArray(events)
        ? events.map((raw) => {
            const e = record(raw);
            return {
              at: text(e["at"]),
              transition: text(e["transition_id"]),
              delta: text(e["delta_id"]),
            };
          })
        : [],
      delta: { K: number(delta["K"]), W: number(delta["W"]), U: number(delta["U"]) },
    };
  });
  const planning = record(
    record(record(record(governed["pathways"])["selection"])["action"])["planning"],
  );
  const selected = record(planning["selected_branch"])["branch_id"];
  const branches = planning["branches"];
  const futures = Array.isArray(branches)
    ? branches.map((raw) => {
        const b = record(raw);
        return {
          id: String(b["branch_id"]),
          title: branchTitle(b),
          actions: strings(b["actions"]),
          risks: strings(b["risks"]),
          selected: b["branch_id"] === selected,
        };
      })
    : [];
  const emergences = Object.entries(record(kv["emergences"])).map(([id, raw]) => {
    const e = record(raw);
    return {
      id,
      property: text(e["new_property"]) ?? id,
      capability: text(e["new_capability"]),
      status: text(e["status"]),
      participants: strings(e["participating_form_ids"]),
    };
  });
  return {
    nodes,
    edges: [...edges.values()],
    emergences,
    futures,
    objective: text(record(governed["objective"])["text"]),
    source: "live",
    revision: live.publicationRevision ?? null,
  };
}
