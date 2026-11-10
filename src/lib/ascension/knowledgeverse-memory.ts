/**
 * Per-user Knowledgeverse memory.
 * The Crystalline Lattice Matrix indexes Meaning Elements and their relationships.
 * That is an organizing structure, not a claim that water or a physical crystal stores data.
 * This is not a chat transcript. One owner's records are never returned for another owner.
 */

export type EvidenceState = "recorded" | "verified";
export type MemoryKind = "objective" | "pathway" | "selection" | "contradiction" | "unsuccessful" | "verified_outcome";

export type MeaningElement = { id: string; owner: string; name: string };
export type LatticeRecord = {
  id: string;
  owner: string;
  kind: MemoryKind;
  text: string;
  elements: string[];
  relates_to: string[];
  evidence: EvidenceState;
  lineage: string[];
  created_at: string;
};
export type LatticeRelationship = { from: string; to: string; relation: string; owner: string };
export type Lattice = {
  owner: string;
  elements: MeaningElement[];
  records: LatticeRecord[];
  relationships: LatticeRelationship[];
};

const STOP = new Set(["that", "this", "with", "from", "your", "have", "what", "want", "into", "about", "they", "them", "then", "than", "just", "only", "when", "where", "which", "would", "could", "should", "there", "their", "been", "were", "will", "make", "made"]);
const STORE_KEY = "ascension.knowledgeverse.lattice.v1";
const OWNER_KEY = "ascension.knowledgeverse.owner.v1";

type StoragePort = Pick<Storage, "getItem" | "setItem">;

function storage(): StoragePort | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}
function now(): string { return new Date().toISOString(); }
function nid(): string {
  const cryptoId = globalThis.crypto?.randomUUID?.();
  return cryptoId ?? `kv-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function meaningTokens(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(word => word.length >= 4 && !STOP.has(word)))].slice(0, 24);
}

export function emptyLattice(owner: string): Lattice {
  return { owner, elements: [], records: [], relationships: [] };
}

function sameOwner(lattice: Lattice): Lattice {
  return {
    owner: lattice.owner,
    elements: lattice.elements.filter(element => element.owner === lattice.owner),
    records: lattice.records.filter(record => record.owner === lattice.owner),
    relationships: lattice.relationships.filter(link => link.owner === lattice.owner),
  };
}

function ensureElements(lattice: Lattice, names: string[]): { lattice: Lattice; ids: string[] } {
  const elements = [...lattice.elements];
  const ids = names.map(name => {
    const found = elements.find(element => element.owner === lattice.owner && element.name === name);
    if (found) return found.id;
    const created = { id: nid(), owner: lattice.owner, name };
    elements.push(created);
    return created.id;
  });
  return { lattice: { ...lattice, elements }, ids };
}

export function remember(lattice: Lattice, input: {
  kind: MemoryKind;
  text: string;
  relatesTo?: string[];
  relation?: string;
  evidence?: EvidenceState;
  lineage?: string[];
}): Lattice {
  const owned = sameOwner(lattice);
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, 700);
  if (!text) return owned;
  const names = meaningTokens(text);
  const prepared = ensureElements(owned, names);
  const id = nid();
  const relates = (input.relatesTo ?? []).filter(related => prepared.lattice.records.some(record => record.id === related));
  const record: LatticeRecord = {
    id,
    owner: owned.owner,
    kind: input.kind,
    text,
    elements: prepared.ids,
    relates_to: relates,
    evidence: input.evidence ?? (input.kind === "verified_outcome" ? "verified" : "recorded"),
    lineage: input.lineage ?? relates,
    created_at: now(),
  };
  const relationships = relates.map(related => ({
    from: related,
    to: id,
    relation: input.relation ?? input.kind,
    owner: owned.owner,
  }));
  return {
    ...prepared.lattice,
    records: [...prepared.lattice.records, record],
    relationships: [...prepared.lattice.relationships, ...relationships],
  };
}

/** A verified outcome stays connected to the earlier record. The earlier record remains. */
export function connectVerified(lattice: Lattice, recordId: string, text: string): Lattice {
  const owned = sameOwner(lattice);
  const prior = owned.records.find(record => record.id === recordId);
  if (!prior) return owned;
  return remember(owned, {
    kind: "verified_outcome",
    text,
    relatesTo: [prior.id],
    relation: "verified_from",
    evidence: "verified",
    lineage: [...prior.lineage, prior.id],
  });
}

export function relevantMemory(lattice: Lattice, objective: string, limit = 8): LatticeRecord[] {
  const owned = sameOwner(lattice);
  const tokens = new Set(meaningTokens(objective));
  if (!tokens.size) return [];
  const elementIds = new Set(owned.elements.filter(element => tokens.has(element.name)).map(element => element.id));
  const direct = owned.records.filter(record => record.elements.some(id => elementIds.has(id)) || meaningTokens(record.text).some(token => tokens.has(token)));
  const directIds = new Set(direct.map(record => record.id));
  const linkedIds = new Set(owned.relationships.filter(link => directIds.has(link.from) || directIds.has(link.to)).flatMap(link => [link.from, link.to]));
  const linked = owned.records.filter(record => linkedIds.has(record.id) && !directIds.has(record.id));
  return [...direct, ...linked].slice(-Math.max(1, limit));
}

export function recallContext(lattice: Lattice, objective: string): string {
  const records = relevantMemory(lattice, objective);
  if (!records.length) return "";
  const lines = records.map(record => {
    const links = record.relates_to.length ? ` linked:${record.relates_to.join(",")}` : "";
    return `- [${record.evidence} ${record.kind}] ${record.text}${links}`;
  });
  return [`This user's Knowledgeverse memory. Not another user's. Not verified unless the line says verified.`, ...lines].join("\n").slice(0, 4000);
}

export function readLattice(port: StoragePort | undefined = storage()): Lattice {
  const owner = port?.getItem(OWNER_KEY) || nid();
  try { port?.setItem(OWNER_KEY, owner); } catch { /* The lattice can still be used in this call. */ }
  try {
    const raw: unknown = JSON.parse(port?.getItem(STORE_KEY) ?? "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyLattice(owner);
    const value = raw as Lattice;
    if (value.owner !== owner) return emptyLattice(owner);
    return sameOwner({ ...emptyLattice(owner), ...value, owner });
  } catch {
    return emptyLattice(owner);
  }
}

export function writeLattice(lattice: Lattice, port: StoragePort | undefined = storage()): void {
  const owned = sameOwner(lattice);
  try {
    port?.setItem(OWNER_KEY, owned.owner);
    port?.setItem(STORE_KEY, JSON.stringify(owned));
  } catch { /* Memory stays in the current result even if storage is blocked. */ }
}
