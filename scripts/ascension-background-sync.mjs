#!/usr/bin/env node
/**
 * Private, owner-paired ASCENSION desktop folder exchange.
 *
 * This process is supervised by the user's loopback-only Python companion.
 * Pairing data arrives ONCE on stdin (never via argv, environment variables,
 * a config file or the shared folder). The passphrase and Library Card
 * capability live in process memory until "stop syncing" or companion exit.
 * No remote service, cloud account or remote model is involved.
 */
import { createHash, createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, rename, unlink, readdir, stat, realpath } from "node:fs/promises";
import { resolve, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const PREFIX = "ASCENSION-Private-Sync-";
const SUFFIX = ".ascension";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CARD = /^[0-9a-f]{64}$/;
const MAX_FILE = 64 * 1024 * 1024;
const MAX_PEERS = 16;
const MAX_CRYSTALS = 128;
const AAD = Buffer.from("ASCENSION:owner-owned-library-card-backup:v1");
const KDF_ITERATIONS = 310000;
const FORMAT = "ascension-library-card-encrypted";
const PAYLOAD = "ascension-device-crystals";
// An explicit test-only cadence allows OS acceptance to exercise repeated cycles
// without waiting three minutes; normal owner sessions retain the 3-minute rate.
const INTERVAL_MS = process.env.NODE_ENV === "test" &&
  /^[0-9]{1,5}$/.test(process.env.ASCENSION_BG_ACCEPTANCE_INTERVAL_MS || "")
    ? Math.max(1000, Number(process.env.ASCENSION_BG_ACCEPTANCE_INTERVAL_MS))
    : 180000;
const validUuid = value => typeof value === "string" && UUID.test(value);
const validDate = value => typeof value === "string" && value.length <= 35 &&
  /^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z$/.test(value) && !Number.isNaN(Date.parse(value));
function ensure(condition, reason) { if (!condition) throw new Error(reason); }
function validPassphrase(value) {
  ensure(typeof value === "string" && value.length >= 12 && value.length <= 256,
    "Private sync requires a 12-256-character passphrase.");
}
export function backgroundDeviceId(browserId) {
  ensure(validUuid(browserId), "Invalid browser sync identity.");
  const b = createHash("sha256").update("ASCENSION:desktop-background:v1:" + browserId).digest();
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = b.subarray(0, 16).toString("hex");
  return h.slice(0,8) + "-" + h.slice(8,12) + "-" + h.slice(12,16) + "-" + h.slice(16,20) + "-" + h.slice(20,32);
}
export function backgroundFileName(browserId) {
  return PREFIX + backgroundDeviceId(browserId) + SUFFIX;
}
function strictBase64(value, size = null) {
  ensure(typeof value === "string" && value.length <= MAX_FILE * 2 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),
    "Invalid encrypted archive encoding.");
  const b = Buffer.from(value, "base64");
  ensure(size === null || b.length === size, "Invalid encrypted archive parameters.");
  return b;
}
function keyFor(password, salt) {
  validPassphrase(password);
  return pbkdf2Sync(password, salt, KDF_ITERATIONS, 32, "sha256");
}
export function decryptArchive(raw, password) {
  ensure(Buffer.byteLength(raw, "utf8") <= MAX_FILE, "An archive exceeds 64 MB.");
  let outer;
  try { outer = JSON.parse(raw); } catch { throw new Error("Invalid encrypted archive."); }
  ensure(outer && outer.format === FORMAT && outer.version === 1 &&
    outer.cipher === "AES-256-GCM" && outer.kdf === "PBKDF2-SHA-256" &&
    outer.iterations === KDF_ITERATIONS, "Unsupported encrypted archive.");
  const salt = strictBase64(outer.salt, 16);
  const iv = strictBase64(outer.iv, 12);
  const bytes = strictBase64(outer.data);
  ensure(bytes.length >= 17 && bytes.length <= MAX_FILE, "Invalid encrypted archive size.");
  let clear;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFor(password, salt), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(bytes.subarray(bytes.length - 16));
    clear = Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]);
  } catch { throw new Error("Incorrect passphrase or tampered encrypted peer archive."); }
  let payload;
  try { payload = JSON.parse(clear.toString("utf8")); }
  catch { throw new Error("Invalid authenticated archive contents."); }
  ensure(payload && payload.format === PAYLOAD && payload.version === 1 &&
    Array.isArray(payload.crystals), "Invalid authenticated Library Card.");
  return payload;
}
export function encryptArchive(crystals, password) {
  validPassphrase(password);
  const plain = Buffer.from(JSON.stringify({
    format: PAYLOAD, version: 1, exportedAt: new Date().toISOString(), crystals,
  }));
  ensure(plain.length <= MAX_FILE / 2, "Library Card history exceeds safe archive limit.");
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(password, salt), iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const output = JSON.stringify({
    format: FORMAT, version: 1, cipher: "AES-256-GCM", kdf: "PBKDF2-SHA-256",
    iterations: KDF_ITERATIONS, salt: salt.toString("base64"),
    iv: iv.toString("base64"), data: encrypted.toString("base64"),
  });
  ensure(Buffer.byteLength(output) <= MAX_FILE, "Encrypted archive exceeds safe limit.");
  return output;
}
function validDraft(d) {
  ensure(d && validUuid(d.jobId) && validDate(d.recordedAt) &&
    d.status === "unverified_local_draft" &&
    typeof d.model === "string" && d.model.length > 0 && d.model.length <= 300 &&
    typeof d.content === "string" && d.content.length > 0 && d.content.length <= 50000,
    "Archive contains an invalid development.");
  return { jobId:d.jobId, recordedAt:d.recordedAt, model:d.model,
    content:d.content, status:"unverified_local_draft" };
}
function validCrystal(c) {
  ensure(c && validUuid(c.id) && typeof c.intent === "string" &&
    c.intent.trim() && c.intent.length <= 4000 &&
    validDate(c.createdAt) && validDate(c.updatedAt) &&
    c.verifiedRevision === null && c.verifiedAt === null &&
    c.verifiedGrowthCount === 0 && Array.isArray(c.drafts) && c.drafts.length <= 64,
    "Archive contains an invalid or unsupported intent.");
  const seen = new Set();
  const drafts = c.drafts.map(d => {
    const next = validDraft(d);
    ensure(!seen.has(next.jobId), "Duplicate archived development.");
    seen.add(next.jobId);
    return next;
  });
  return { id:c.id, intent:c.intent, createdAt:c.createdAt, updatedAt:c.updatedAt,
    verifiedRevision:null, verifiedAt:null, verifiedGrowthCount:0,
    developing:false, drafts, queuedJobId:null, lastLocalJobAt:null };
}
function companionCrystals(snapshot) {
  ensure(snapshot && snapshot.format === "ascension-companion-finished-history" &&
    snapshot.version === 1 && Array.isArray(snapshot.crystals) &&
    snapshot.crystals.length <= MAX_CRYSTALS, "Invalid companion history.");
  let jobCount = 0;
  return snapshot.crystals.map(record => {
    ensure(record && Array.isArray(record.jobs), "Invalid companion record.");
    const drafts = [];
    for (const job of record.jobs) {
      jobCount++;
      ensure(jobCount <= 4096, "Companion history exceeds safe limit.");
      if (job.status === "blocked") continue;
      ensure(job.status === "completed" && validUuid(job.id) &&
        validDate(job.finished_at) && typeof job.model === "string" &&
        typeof job.result === "string", "Invalid completed companion history.");
      drafts.push({jobId:job.id,recordedAt:job.finished_at,model:job.model,
        content:job.result,status:"unverified_local_draft"});
    }
    ensure(drafts.length <= 64, "Companion history exceeds 64 developments per intent.");
    return validCrystal({
      id:record.id,intent:record.intent,createdAt:record.createdAt,
      updatedAt:record.updatedAt,verifiedRevision:null,verifiedAt:null,
      verifiedGrowthCount:0,drafts,
    });
  });
}
export function mergeArchives(payloads, companion = null) {
  const all = new Map();
  for (const payload of payloads) {
    ensure(payload && Array.isArray(payload.crystals) &&
      payload.crystals.length <= MAX_CRYSTALS, "Invalid archive crystal count.");
    const groups = [payload.crystals];
    if (payload.companion) groups.push(companionCrystals(payload.companion));
    for (const group of groups) for (const candidate of group) {
      const next = validCrystal(candidate);
      const prev = all.get(next.id);
      if (!prev) { all.set(next.id, next); continue; }
      ensure(prev.intent === next.intent, "Original intent conflict: exchange halted.");
      const drafts = new Map(prev.drafts.map(d => [d.jobId,d]));
      for (const d of next.drafts) {
        const earlier = drafts.get(d.jobId);
        if (earlier) ensure(earlier.model === d.model &&
          earlier.content === d.content && earlier.recordedAt === d.recordedAt,
          "Conflicting development: exchange halted.");
        else drafts.set(d.jobId, d);
      }
      ensure(drafts.size <= 64, "Development history exceeds the no-loss limit.");
      prev.drafts = [...drafts.values()].sort((a,b) => a.recordedAt.localeCompare(b.recordedAt));
      if (Date.parse(next.updatedAt) > Date.parse(prev.updatedAt))
        prev.updatedAt = next.updatedAt;
    }
  }
  if (companion) {
    const extra = companionCrystals(companion);
    return mergeArchives([{crystals:[...all.values()]},{crystals:extra}], null);
  }
  ensure(all.size <= MAX_CRYSTALS, "Library Card has exceeded 128 originals.");
  return [...all.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
}
function isSyncArchive(name) {
  if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) return false;
  return validUuid(name.slice(PREFIX.length,-SUFFIX.length));
}
async function readCompanion(libraryKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch("http://127.0.0.1:8788/v1/snapshot", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({libraryKey}), signal:controller.signal,
    });
    ensure(r.ok, "Local companion history is unavailable.");
    return r.json();
  } finally { clearTimeout(timer); }
}
export async function runBackgroundCycle(config, loadCompanion = readCompanion) {
  const { directory, passphrase, browserDeviceId, libraryKey } = config;
  ensure(typeof directory === "string" && isAbsolute(directory),
    "Desktop sync folder must be an absolute path.");
  ensure(validUuid(browserDeviceId) && CARD.test(libraryKey),
    "Missing valid owner-paired device identity.");
  validPassphrase(passphrase);
  const folder = await realpath(resolve(directory));
  const own = backgroundFileName(browserDeviceId);
  const entries = await readdir(folder, {withFileTypes:true});
  const peers = entries.filter(item => item.isFile() && isSyncArchive(item.name));
  ensure(peers.length <= MAX_PEERS + 2, "More than 16 private sync archives were found.");
  const payloads = [];
  for (const entry of peers.sort((a,b) => a.name.localeCompare(b.name))) {
    const path = join(folder, entry.name);
    const size = (await stat(path)).size;
    ensure(size >= 100 && size <= MAX_FILE, "An encrypted archive has an invalid size.");
    payloads.push(decryptArchive(await readFile(path,"utf8"),passphrase));
  }
  // The companion may continue developing drafts with every browser closed.
  // Never invent progress if its SQLite snapshot cannot be read.
  const companion = await loadCompanion(libraryKey);
  const merged = mergeArchives(payloads, companion);
  const output = encryptArchive(merged,passphrase);
  const destination = join(folder,own);
  const temporary = join(folder,"." + own + "." + randomUUID() + ".tmp");
  try {
    await writeFile(temporary,output,{flag:"wx",mode:0o600});
    await rename(temporary,destination);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return { crystals:merged.length, peers:peers.length, archive:own };
}
async function main() {
  let input = "";
  for await (const part of process.stdin) {
    input += part.toString();
    ensure(input.length <= 8192, "Background pairing input too large.");
  }
  const config = JSON.parse(input);
  // No secrets in logs, command-line arguments, environment variables or disk.
  let running = false;
  const execute = async () => {
    if (running) return;
    running = true;
    try { await runBackgroundCycle(config); }
    catch (error) {
      process.stderr.write("ASCENSION background sync: " +
        (error instanceof Error ? error.message : "cycle failed") + "\n");
    } finally { running = false; }
  };
  await execute();
  // The owner explicitly pairs through the Python companion. If that parent
  // is killed unexpectedly, never leave an orphan holding the passphrase.
  const pairedCompanionPid = process.ppid;
  setInterval(() => {
    try { process.kill(pairedCompanionPid, 0); }
    catch { process.exit(0); }
  }, 10000);
  setInterval(() => { void execute(); }, INTERVAL_MS);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.exitCode = 1; });
}
