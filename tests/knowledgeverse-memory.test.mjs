import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/ascension/knowledgeverse-memory.ts", import.meta.url), "utf8");
const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
};
const memory = await import("../src/lib/ascension/knowledgeverse-memory.ts");

const first = memory.remember(memory.readLattice(), { kind: "objective", text: "worker drone for people with dementia" });
memory.writeLattice(first);
const recalled = memory.recallContext(memory.readLattice(), "dementia worker drone");
assert.match(recalled, /worker drone/);
assert.match(source, /not a claim that water or a crystal stores the data/);

store.set("ascension.knowledgeverse.owner.v1", "someone-else");
assert.equal(memory.readLattice().records.length, 0);
console.log("PASS knowledgeverse memory stays with one user");
