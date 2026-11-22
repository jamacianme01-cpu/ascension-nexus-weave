/**
 * Durable, serialized Library Card crystal records. The autonomous worker and
 * guest functions share the SAME file lock; neither can silently overwrite the
 * other's newer intent, pending run, or verified evidence.
 */
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type VerifiedCrystalSnapshot = {
  requestId: string;
  guestToken: string;
  revision: number;
  completedAt: string;
};
export type IntentCrystalRecord = {
  id: string;
  intent: string;
  requestId: string;
  guestToken: string;
  createdAt: string;
  updatedAt: string;
  verifiedRevision: number | null;
  verifiedAt: string | null;
  lastVerified?: VerifiedCrystalSnapshot;
  history?: VerifiedCrystalSnapshot[];
  lastAutoQueuedAt?: string;
};
const CARD_KEY = /^[a-f0-9]{64}$/i;
const LEDGER_NAME = /^[a-f0-9]{64}\.json$/i;
const WAIT_MS = 125;
const MAX_WAIT_MS = 15000;
const STALE_LOCK_MS = 10 * 60 * 1000;

export function crystalStorageFolder(): string {
  const configured = process.env["ASCENSION_STORAGE_DIR"]?.trim() ?? "";
  if (!configured || !path.isAbsolute(configured))
    throw new Error("ASCENSION_STORAGE_DIR must be an absolute persistent directory.");
  return path.join(configured, "intent-crystals");
}
export function crystalLedgerFilename(libraryKey: string): string {
  if (!CARD_KEY.test(libraryKey)) throw new Error("Invalid Library Card capability.");
  const digest = createHash("sha256").update(libraryKey.toLowerCase()).digest("hex");
  return path.join(crystalStorageFolder(), digest + ".json");
}
export async function readCrystalLedger(filename: string): Promise<IntentCrystalRecord[]> {
  if (!LEDGER_NAME.test(path.basename(filename)) ||
      path.dirname(filename) !== crystalStorageFolder())
    throw new Error("Invalid crystal ledger path.");
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filename, "utf8"));
    if (!Array.isArray(parsed) || parsed.some(item =>
      !item || typeof item !== "object" || typeof item.id !== "string" ||
      typeof item.intent !== "string" || typeof item.requestId !== "string" ||
      typeof item.guestToken !== "string"))
      throw new Error("Invalid existing ASCENSION crystal ledger.");
    return parsed as IntentCrystalRecord[];
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }
}
export async function saveCrystalLedger(filename: string, records: IntentCrystalRecord[]) {
  const pending = filename + "." + randomUUID() + ".tmp";
  try {
    await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    await fs.writeFile(pending, JSON.stringify(records), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(pending, filename);
  } finally {
    await fs.unlink(pending).catch(() => {});
  }
}
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
export async function withCrystalLedgerLock<T>(
  filename: string,
  callback: (records: IntentCrystalRecord[]) => Promise<T> | T,
): Promise<T> {
  // Validate paths even when called from the server-side background scheduler.
  if (!LEDGER_NAME.test(path.basename(filename)) ||
      path.dirname(filename) !== crystalStorageFolder())
    throw new Error("Invalid crystal ledger path.");
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const lock = filename + ".evolve.lock";
  const deadline = Date.now() + MAX_WAIT_MS;
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  while (!handle) {
    try {
      handle = await fs.open(lock, "wx", 0o600);
      break;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
      try {
        const stat = await fs.stat(lock);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          await fs.unlink(lock);
          continue;
        }
      } catch { /* Another task may have released the lock. */ }
      if (Date.now() > deadline) throw new Error("Crystal ledger is busy; retry the intent.");
      await sleep(WAIT_MS);
    }
  }
  try {
    const current = await readCrystalLedger(filename);
    return await callback(current);
  } finally {
    await handle.close();
    await fs.unlink(lock).catch(() => {});
  }
}
export function appendVerifiedSnapshot(
  record: IntentCrystalRecord,
  snapshot: VerifiedCrystalSnapshot,
) {
  if (!Number.isInteger(snapshot.revision) || snapshot.revision <= 0)
    throw new Error("Crystal growth cannot be recorded without a governed revision.");
  const existing = record.history ?? [];
  if (!existing.some(item => item.requestId === snapshot.requestId))
    record.history = [...existing, snapshot].slice(-64);
  record.lastVerified = snapshot;
  record.verifiedRevision = snapshot.revision;
  record.verifiedAt = snapshot.completedAt;
}
