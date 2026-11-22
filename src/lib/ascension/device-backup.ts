/**
 * Portable ASCENSION Library Card backup.
 *
 * Password-based AES-256-GCM encryption in the user's own browser. No network,
 * uploaded key, cloud store or central account. A restored archive is decrypted
 * only in the receiving browser and re-encrypted with its own non-extractable
 * local IndexedDB key; the original browser's capability and key NEVER travel.
 */
import {
  listDeviceCrystals, importDeviceCrystals,
  type DeviceCrystal, type LocalDevelopment,
} from "./device-knowledgeverse";
import {
  readDeviceCompanionSnapshot, restoreDeviceCompanionSnapshot,
  type CompanionHistorySnapshot,
} from "./device-companion";

const FILE_FORMAT = "ascension-library-card-encrypted";
const PAYLOAD_FORMAT = "ascension-device-crystals";
const VERSION = 1;
const ITERATIONS = 310_000;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024; // Bound memory and untrusted inputs.
const AAD = new TextEncoder().encode("ASCENSION:owner-owned-library-card-backup:v1");

type Archive = {
  format: typeof FILE_FORMAT;
  version: 1;
  cipher: "AES-256-GCM";
  kdf: "PBKDF2-SHA-256";
  iterations: typeof ITERATIONS;
  salt: string;
  iv: string;
  data: string;
};
type Payload = {
  format: typeof PAYLOAD_FORMAT;
  version: 1;
  exportedAt: string;
  crystals: DeviceCrystal[];
  companion?: CompanionHistorySnapshot;
};
export type LibraryRestoreSummary = {
  imported: number;
  skipped: number;
  totalInArchive: number;
  companionIncluded?: boolean;
  companionRestored?: boolean;
  importedCompanionJobs?: number;
};
function passwordAllowed(password: string) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256)
    throw new Error("Backup passphrase must contain 12–256 characters.");
}
function asBase64(buffer: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < buffer.length; offset += 0x8000)
    binary += String.fromCharCode(...buffer.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
function fromBase64(encoded: unknown, length: number | null = null): Uint8Array {
  if (typeof encoded !== "string" || encoded.length > MAX_ARCHIVE_BYTES * 2 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new Error("Invalid encrypted backup encoding.");
  const decoded = atob(encoded);
  if (length !== null && decoded.length !== length)
    throw new Error("Invalid encrypted backup key parameters.");
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}
async function deriveBackupKey(passphrase: string, salt: Uint8Array) {
  passwordAllowed(passphrase);
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(salt), iterations: ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function parseArchive(bytes: string): Archive {
  if (new TextEncoder().encode(bytes).byteLength > MAX_ARCHIVE_BYTES)
    throw new Error("The encrypted archive exceeds the 64 MB import limit.");
  let value: unknown;
  try { value = JSON.parse(bytes); }
  catch { throw new Error("The selected file is not a valid encrypted Library Card."); }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Library Card archive.");
  const item = value as Partial<Archive>;
  if (item.format !== FILE_FORMAT || item.version !== VERSION ||
      item.cipher !== "AES-256-GCM" || item.kdf !== "PBKDF2-SHA-256" ||
      item.iterations !== ITERATIONS)
    throw new Error("This archive format is unsupported or its parameters were changed.");
  return item as Archive;
}
function decodePayload(value: unknown): Payload {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Decrypted Library Card payload was invalid.");
  const entry = value as Partial<Payload>;
  if (entry.format !== PAYLOAD_FORMAT || entry.version !== VERSION ||
      !Array.isArray(entry.crystals) || typeof entry.exportedAt !== "string")
    throw new Error("Decrypted Library Card format was invalid.");
  return entry as Payload;
}

function addFinishedCompanionHistory(
  records: DeviceCrystal[],
  snapshot: CompanionHistorySnapshot,
): DeviceCrystal[] {
  if (snapshot?.format !== "ascension-companion-finished-history" ||
      snapshot.version !== 1 || !Array.isArray(snapshot.crystals) ||
      snapshot.crystals.length > 128)
    throw new Error("Invalid local companion history; no backup was written.");
  const byId = new Map(records.map(item => [item.id, {
    ...item, drafts: [...item.drafts],
  }]));
  let jobs = 0;
  for (const source of snapshot.crystals) {
    if (!source || typeof source.id !== "string" ||
        typeof source.intent !== "string" || !Array.isArray(source.jobs))
      throw new Error("Invalid companion crystal history.");
    let item = byId.get(source.id);
    if (item && item.intent !== source.intent)
      throw new Error("Local companion intent does not match the Library Card original.");
    if (!item) {
      item = {
        id: source.id, intent: source.intent,
        createdAt: source.createdAt, updatedAt: source.updatedAt,
        verifiedRevision: null, verifiedAt: null, verifiedGrowthCount: 0,
        developing: false, drafts: [], queuedJobId: null, lastLocalJobAt: null,
      };
      byId.set(item.id, item);
    }
    for (const job of source.jobs) {
      jobs++;
      if (jobs > 4096) throw new Error("Companion history exceeds the safe job limit.");
      if (job.status === "blocked") continue; // Archive still preserves its error history.
      if (job.status !== "completed" || typeof job.id !== "string" ||
          typeof job.model !== "string" || typeof job.result !== "string" ||
          typeof job.finished_at !== "string")
        throw new Error("Invalid companion completed development.");
      if (item.drafts.some(existing => existing.jobId === job.id)) continue;
      const next: LocalDevelopment = {
        jobId: job.id,
        recordedAt: job.finished_at, model: job.model,
        content: job.result, status: "unverified_local_draft",
      };
      item.drafts.push(next);
    }
    item.drafts.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    item.drafts = item.drafts.slice(-64);
  }
  if (byId.size > 128) throw new Error("Companion archive exceeds the safe crystal limit.");
  return [...byId.values()];
}

export async function createEncryptedLibraryBackupWithStatus(
  passphrase: string,
): Promise<{ file: Blob; companionIncluded: boolean }> {
  passwordAllowed(passphrase);
  const local = await listDeviceCrystals();
  let companion: CompanionHistorySnapshot | undefined;
  try {
    companion = await readDeviceCompanionSnapshot();
  } catch {
    // The browser archive remains usable on mobile or when the local
    // companion is shut down. Report the missing companion data explicitly.
  }
  // Validate ahead of encryption; store SQLite history ONCE in the archive,
  // then fold it into device crystals during restore. Avoid duplicating up to
  // 20 MB of private development history and exhausting archive limits.
  if (companion) addFinishedCompanionHistory(local, companion);
  const payload: Payload = {
    format: PAYLOAD_FORMAT, version: VERSION,
    exportedAt: new Date().toISOString(), crystals: local,
    ...(companion ? { companion } : {}),
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  if (plaintext.length > MAX_ARCHIVE_BYTES / 2)
    throw new Error("The Knowledgeverse exceeds this archive's safe size limit.");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD }, key, plaintext);
  const archive: Archive = {
    format: FILE_FORMAT, version: VERSION,
    cipher: "AES-256-GCM", kdf: "PBKDF2-SHA-256",
    iterations: ITERATIONS,
    salt: asBase64(salt), iv: asBase64(iv),
    data: asBase64(new Uint8Array(encrypted)),
  };
  const content = JSON.stringify(archive);
  if (new TextEncoder().encode(content).length > MAX_ARCHIVE_BYTES)
    throw new Error("The encrypted Knowledgeverse archive exceeds 64 MB.");
  return { file: new Blob([content], { type: "application/octet-stream" }),
    companionIncluded: Boolean(companion) };
}
export async function createEncryptedLibraryBackup(passphrase: string): Promise<Blob> {
  return (await createEncryptedLibraryBackupWithStatus(passphrase)).file;
}

/**
 * Decrypt AND validate the entire archive before any original is changed.
 * Import is merge-add-only: an existing crystal is never overwritten,
 * even by an older backup of itself. Conflicting originals abort the import.
 */
export async function restoreEncryptedLibraryBackup(
  archivedText: string, passphrase: string,
): Promise<LibraryRestoreSummary> {
  const archive = parseArchive(archivedText);
  const salt = fromBase64(archive.salt, 16);
  const iv = fromBase64(archive.iv, 12);
  const encrypted = fromBase64(archive.data);
  if (encrypted.length < 17 || encrypted.length > MAX_ARCHIVE_BYTES)
    throw new Error("Invalid encrypted archive content.");
  const key = await deriveBackupKey(passphrase, salt);
  let clear: ArrayBuffer;
  try {
    clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv), additionalData: AAD }, key, new Uint8Array(encrypted));
  } catch {
    throw new Error("Incorrect passphrase or damaged archive. No local records were changed.");
  }
  let result: unknown;
  try { result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(clear)); }
  catch { throw new Error("Decrypted archive was damaged. No local records were changed."); }
  const payload = decodePayload(result);
  const crystals = payload.companion
    ? addFinishedCompanionHistory(payload.crystals, payload.companion)
    : payload.crystals;
  const outcome = await importDeviceCrystals(crystals);
  if (payload.companion) {
    try {
      const added = await restoreDeviceCompanionSnapshot(payload.companion);
      return {
        ...outcome, totalInArchive: crystals.length,
        companionIncluded: true, companionRestored: true,
        importedCompanionJobs: added.importedJobs,
      };
    } catch {
      // All completed local drafts in the archive have still been added into
      // encrypted browser storage. Restoring SQLite requires a running companion.
      return {
        ...outcome, totalInArchive: crystals.length,
        companionIncluded: true, companionRestored: false,
      };
    }
  }
  return { ...outcome, totalInArchive: crystals.length };
}

export function encryptedLibraryBackupFilename(): string {
  return "ASCENSION-Library-Card-" + new Date().toISOString().slice(0, 10) + ".ascension";
}
