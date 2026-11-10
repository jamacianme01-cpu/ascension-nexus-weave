/**
 * This user's Knowledgeverse, kept in the browser.
 * The Crystalline Lattice Matrix is the index of Meaning Elements and
 * relationships. It is not a claim that water or a crystal stores the data.
 * One user's records are never written into another user's lattice.
 */
export type MemoryKind = "objective" | "pathway" | "selection" | "contradiction" | "unsuccessful" | "verified_outcome";
export type MemoryRecord = {
  id: string;
  kind: MemoryKind;
  text: string;
  createdAt: string;
  verified: boolean;
  relatesTo: string[];
};
export type Lattice = {
  owner: string;
  records: MemoryRecord[];
};
const LATTICE_KEY = "ascension.knowledgeverse.lattice.v1";
const OWNER_KEY = "ascension.knowledgeverse.owner.v1";
const STOP = new Set(["what", "with", "this", "that", "from", "have", "your", "want", "need", "into", "about", "would", "could", "should"]);

function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function ownerKey(): string {
  const store = storage();
  const existing = store?.getItem(OWNER_KEY);
  if (existing) return existing;
  const created = "user-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  store?.setItem(OWNER_KEY, created);
  return created;
}
export function emptyLattice(owner = ownerKey()): Lattice {
  return { owner, records: [] };
}
export function readLattice(): Lattice {
  const owner = ownerKey();
  const raw = storage()?.getItem(LATTICE_KEY);
  if (!raw) return emptyLattice(owner);
  try {
    const parsed = JSON.parse(raw) as Lattice;
    if (parsed.owner !== owner || !Array.isArray(parsed.records)) return emptyLattice(owner);
    return { owner, records: parsed.records.slice(-200) };
  } catch {
    return emptyLattice(owner);
  }
}
export function writeLattice(lattice: Lattice): void {
  if (lattice.owner !== ownerKey()) return;
  storage()?.setItem(LATTICE_KEY, JSON.stringify({ ...lattice, records: lattice.records.slice(-200) }));
}
export function remember(lattice: Lattice, input: { kind: MemoryKind; text: string; relatesTo?: string[]; verified?: boolean }): Lattice {
  if (lattice.owner !== ownerKey()) return lattice;
  const text = input.text.trim().slice(0, 1200);
  if (text.length < 3) return lattice;
  const record: MemoryRecord = {
    id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    kind: input.kind,
    text,
    createdAt: new Date().toISOString(),
    verified: input.verified === true,
    relatesTo: (input.relatesTo ?? []).filter(id => lattice.records.some(record => record.id === id)).slice(0, 8),
  };
  return { owner: lattice.owner, records: [...lattice.records, record].slice(-200) };
}
function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 4 && !STOP.has(word)));
}
export function relevantMemory(lattice: Lattice, objective: string, limit = 8): MemoryRecord[] {
  const wanted = tokens(objective);
  const ranked = lattice.records.map(record => ({
    record,
    score: [...tokens(record.text)].filter(word => wanted.has(word)).length,
  })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  const chosen = ranked.slice(0, limit).map(item => item.record);
  const linked = new Set(chosen.flatMap(record => record.relatesTo));
  for (const record of lattice.records) if (linked.has(record.id) && !chosen.includes(record)) chosen.push(record);
  return chosen.slice(0, limit);
}
export function recallContext(lattice: Lattice, objective: string): string {
  const lines = relevantMemory(lattice, objective).map(record =>
    record.kind + (record.verified ? " (verified)" : "") + ": " + record.text);
  return lines.join("\n").slice(0, 4000);
}
