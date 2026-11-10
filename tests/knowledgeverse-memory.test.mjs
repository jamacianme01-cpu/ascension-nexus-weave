import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { resolve } from "node:path";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } },
});
const memory = await server.ssrLoadModule("/src/lib/ascension/knowledgeverse-memory.ts");
const route = await readFile("src/routes/api/public/ascension/independent.ts", "utf8");
const engage = await readFile("src/components/ascension/independent-engage.tsx", "utf8");

const port = new Map();
const store = {
  getItem: key => port.get(key) ?? null,
  setItem: (key, value) => port.set(key, value),
};

let lattice = memory.emptyLattice("user-a");
lattice = memory.remember(lattice, { kind: "objective", text: "worker drones for people with dementia" });
const first = lattice.records.at(-1);
lattice = memory.remember(lattice, {
  kind: "unsuccessful",
  text: "A generic delivery drone missed the dementia care requirement",
  relatesTo: [first.id],
  relation: "correction_of",
});
lattice = memory.remember(lattice, {
  kind: "pathway",
  text: "A calm indoor assist drone that stays with the person",
  relatesTo: [first.id],
  relation: "pathway_for",
});
const before = lattice.records.length;
lattice = memory.connectVerified(lattice, first.id, "The indoor assist approach was kept and the generic drone was rejected");
assert.equal(lattice.records.length, before + 1);
assert.equal(lattice.records.find(record => record.id === first.id).text.includes("dementia"), true);
assert.equal(lattice.records.at(-1).evidence, "verified");
assert.ok(lattice.records.at(-1).lineage.includes(first.id));

const recalled = memory.relevantMemory(lattice, "design a drone for dementia care");
assert.ok(recalled.some(record => record.kind === "unsuccessful"));
assert.ok(recalled.some(record => record.kind === "verified_outcome"));
assert.match(memory.recallContext(lattice, "design a drone for dementia care"), /This user's Knowledgeverse memory/);

const other = memory.emptyLattice("user-b");
const leaked = memory.remember({ ...other, records: lattice.records, elements: lattice.elements, relationships: lattice.relationships }, {
  kind: "objective",
  text: "open a bakery",
});
assert.equal(leaked.records.every(record => record.owner === "user-b"), true);
assert.equal(memory.relevantMemory(leaked, "worker drones for dementia").length, 0);

memory.writeLattice(lattice, store);
const loaded = memory.readLattice(store);
assert.equal(loaded.owner, "user-a");
assert.equal(loaded.records.length, lattice.records.length);
const stranger = { getItem: key => key.endsWith("owner.v1") ? "user-c" : store.getItem(key), setItem() {} };
assert.equal(memory.readLattice(stranger).records.length, 0);

assert.match(route, /THIS USER'S KNOWLEDGEVERSE MEMORY/);
assert.match(engage, /recallContext/);
assert.match(engage, /kind: "contradiction"/);
assert.doesNotMatch(engage, /conversation history|chat transcript/i);
assert.match(await readFile("src/lib/ascension/knowledgeverse-memory.ts", "utf8"), /not a claim that water or a physical crystal stores data/);

await server.close();
console.log("PASS per-user Knowledgeverse memory stays related and isolated");
