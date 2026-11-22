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
  type DeviceCrystal,
} from "./device-knowledgeverse";

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
};
export type LibraryRestoreSummary = {
  imported: number;
  skipped: number;
  totalInArchive: number;
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
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
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

export async function createEncryptedLibraryBackup(passphrase: string): Promise<Blob> {
  passwordAllowed(passphrase);
  const crystals = await listDeviceCrystals();
  const payload: Payload = {
    format: PAYLOAD_FORMAT, version: VERSION,
    exportedAt: new Date().toISOString(), crystals,
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
  return new Blob([content], { type: "application/octet-stream" });
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
      { name: "AES-GCM", iv, additionalData: AAD }, key, encrypted);
  } catch {
    throw new Error("Incorrect passphrase or damaged archive. No local records were changed.");
  }
  let result: unknown;
  try { result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(clear)); }
  catch { throw new Error("Decrypted archive was damaged. No local records were changed."); }
  const payload = decodePayload(result);
  const outcome = await importDeviceCrystals(payload.crystals);
  return { ...outcome, totalInArchive: payload.crystals.length };
}

export function encryptedLibraryBackupFilename(): string {
  return "ASCENSION-Library-Card-" + new Date().toISOString().slice(0, 10) + ".ascension";
}
