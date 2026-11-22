import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import ts from "typescript";

const input = readFileSync("src/lib/ascension/intent-crystal-ledger.server.ts", "utf8");
// Load the *real* TypeScript ledger module with TS type erasure; this is not
// a hand-written mock of locking or storage behavior.
const compiled = ts.transpileModule(input, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "intent-crystal-ledger.server.ts",
}).outputText;
const ledger = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const dir = await mkdtemp(join(tmpdir(), "ascension-crystal-ledger-"));
const previous = process.env.ASCENSION_STORAGE_DIR;
process.env.ASCENSION_STORAGE_DIR = dir;
const card = "d".repeat(64);
const filename = ledger.crystalLedgerFilename(card);
const crystal = n => ({
  id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"),
  intent: "Owner-intent-" + n,
  requestId: "22222222-2222-4222-8222-" + String(n).padStart(12, "0"),
  guestToken: "33333333-3333-4333-8333-" + String(n).padStart(12, "0"),
  createdAt: "2026-11-21T00:00:00.000Z",
  updatedAt: "2026-11-21T00:00:00.000Z",
  verifiedRevision: null, verifiedAt: null,
});
try {
  assert.deepEqual(await ledger.readCrystalLedger(filename), []);
  assert.throws(() => ledger.crystalLedgerFilename("../other"), /Invalid Library Card capability/);
  const add = async n => {
    await ledger.withCrystalLedgerLock(filename, async records => {
      await new Promise(resolve => setTimeout(resolve, n === 1 ? 30 : 5));
      records.push(crystal(n));
      await ledger.saveCrystalLedger(filename, records);
    });
  };
  await Promise.all([add(1), add(2)]);
  const first = await ledger.readCrystalLedger(filename);
  assert.equal(first.length, 2, "simultaneous user and worker writes must preserve both intents");
  assert.deepEqual(first.map(x => x.intent).sort(), ["Owner-intent-1", "Owner-intent-2"]);

  const item = first[0];
  const prior = {
    requestId: item.requestId,
    guestToken: item.guestToken,
    revision: 44,
    completedAt: "2026-11-21T12:00:00.000Z",
  };
  assert.throws(() => ledger.appendVerifiedSnapshot(item, { ...prior, revision: 0 }), /governed revision/);
  ledger.appendVerifiedSnapshot(item, prior);
  ledger.appendVerifiedSnapshot(item, prior);
  assert.equal(item.verifiedRevision, 44);
  assert.equal(item.history.length, 1, "repeat inspections cannot create fake additional growth");
  const newRequest = "44444444-4444-4444-8444-000000000001";
  item.requestId = newRequest;
  await ledger.withCrystalLedgerLock(filename, async records => {
    const actual = records.find(x => x.id === item.id);
    assert.ok(actual);
    ledger.appendVerifiedSnapshot(actual, prior);
    actual.requestId = newRequest;
    await ledger.saveCrystalLedger(filename, records);
  });
  const [stored] = await ledger.readCrystalLedger(filename);
  assert.equal(stored.requestId, newRequest);
  assert.equal(stored.lastVerified.requestId, prior.requestId,
    "the previous verified response must remain reachable during a pending continuation");

  const lock = filename + ".evolve.lock";
  await writeFile(lock, "stale");
  const stale = new Date(Date.now() - 11 * 60 * 1000);
  await utimes(lock, stale, stale);
  await ledger.withCrystalLedgerLock(filename, async records => {
    assert.equal(records.length, 2, "stale worker locks may not erase the owner ledger");
  });
  await assert.rejects(stat(lock), error => error.code === "ENOENT");
  assert.deepEqual(JSON.parse(await readFile(filename, "utf8")).length, 2);
  console.log("PASS: concurrent ledger updates; verified-only growth; pending-run recovery; stale lock handling");
} finally {
  if (previous === undefined) delete process.env.ASCENSION_STORAGE_DIR;
  else process.env.ASCENSION_STORAGE_DIR = previous;
  await rm(dir, {recursive:true,force:true});
}
