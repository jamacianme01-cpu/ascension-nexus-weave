/**
 * ASCENSION local-first Knowledgeverse.
 *
 * Crystal content, model drafts and identity remain in this browser's IndexedDB.
 * AES-GCM encrypts each record with a non-extractable, device/browser-local key.
 * No server call or account is needed to store or retrieve an intent.
 *
 * Protection scope: browser-origin storage; NOT a substitute for a device disk
 * password or encrypted user-controlled backup. Clearing site data deletes it.
 */
export type LocalDevelopment = {
  jobId: string;
  recordedAt: string;
  model: string;
  content: string;
  status: "unverified_local_draft";
};
export type DeviceCrystal = {
  id: string;
  intent: string;
  createdAt: string;
  updatedAt: string;
  verifiedRevision: number | null;
  verifiedAt: string | null;
  verifiedGrowthCount: number;
  developing: boolean;
  drafts: LocalDevelopment[];
  queuedJobId: string | null;
  lastLocalJobAt: string | null;
};
type Envelope = { id: string; iv: number[]; cipher: number[] };
const DB_NAME = "ascension-user-owned-knowledgeverse-v1";
const CARD_KEY = "ascension-library-card-capability-v1";
const STORE = "crystals";
const CONFIG = "config";
const KEY_NAME = "nonextractable-aes-gcm-v1";
const MAX = 128;
let opened: Promise<IDBDatabase> | null = null;
let keyPromise: Promise<CryptoKey> | null = null;

function ensureDeviceFeatures() {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues)
    throw new Error("Secure device storage is unavailable in this browser. No intent was uploaded.");
}
function waitRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Device storage request failed."));
  });
}
function transactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Device storage transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Device storage transaction was interrupted."));
  });
}
async function database(): Promise<IDBDatabase> {
  ensureDeviceFeatures();
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CONFIG)) db.createObjectStore(CONFIG);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("Cannot open device Knowledgeverse."));
    request.onblocked = () => reject(new Error("Another tab must close before storage can upgrade."));
  }).catch(error => { opened = null; throw error; });
  return opened;
}
async function cryptoKey() {
  keyPromise ??= (async () => {
    const db = await database();
    const stored = await waitRequest<CryptoKey | undefined>(
      db.transaction(CONFIG, "readonly").objectStore(CONFIG).get(KEY_NAME));
    if (stored) return stored;
    const generated = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const tx = db.transaction(CONFIG, "readwrite");
    const ready = transactionComplete(tx);
    tx.objectStore(CONFIG).add(generated, KEY_NAME);
    try { await ready; } catch (error) {
      // Another same-origin tab may have generated the key concurrently.
      if (!(error instanceof DOMException) || error.name !== "ConstraintError") throw error;
    }
    return (await waitRequest<CryptoKey | undefined>(
      db.transaction(CONFIG, "readonly").objectStore(CONFIG).get(KEY_NAME))) ?? generated;
  })().catch(error => { keyPromise = null; throw error; });
  return keyPromise;
}
function card() {
  ensureDeviceFeatures();
  let id = localStorage.getItem(CARD_KEY);
  if (!id || !/^[a-f0-9]{64}$/.test(id)) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    id = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(CARD_KEY, id);
  }
  return id;
}
export function deviceCardId() { return card(); }

async function encrypt(record: DeviceCrystal): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), bytes);
  return { id: card() + ":" + record.id, iv: Array.from(iv), cipher: Array.from(new Uint8Array(encrypted)) };
}
async function decrypt(value: Envelope): Promise<DeviceCrystal> {
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(value.iv) }, await cryptoKey(),
    new Uint8Array(value.cipher));
  const record: unknown = JSON.parse(new TextDecoder().decode(clear));
  if (!record || typeof record !== "object" || !("id" in record) ||
      !("intent" in record) || !("drafts" in record))
    throw new Error("An encrypted intent record is damaged.");
  return record as DeviceCrystal;
}
async function byId(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid intent crystal.");
  const db = await database();
  const envelope = await waitRequest<Envelope | undefined>(
    db.transaction(STORE, "readonly").objectStore(STORE).get(card() + ":" + id));
  if (!envelope) throw new Error("That intent is not saved on this device.");
  return decrypt(envelope);
}
async function write(record: DeviceCrystal) {
  const encrypted = await encrypt(record);
  const db = await database();
  const tx = db.transaction(STORE, "readwrite");
  const ready = transactionComplete(tx);
  tx.objectStore(STORE).put(encrypted);
  await ready;
  return record;
}
export function deviceSummary(record: DeviceCrystal) {
  const { id, intent, createdAt, updatedAt, verifiedRevision, verifiedAt, verifiedGrowthCount, developing } = record;
  return { id, intent, createdAt, updatedAt, verifiedRevision, verifiedAt, verifiedGrowthCount, developing };
}
export async function listDeviceCrystals(): Promise<DeviceCrystal[]> {
  const db = await database();
  const all = await waitRequest<Envelope[]>(
    db.transaction(STORE, "readonly").objectStore(STORE).getAll());
  return (await Promise.all(all.filter(item => item.id.startsWith(card() + ":")).map(decrypt)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function readDeviceCrystal(id: string) { return byId(id); }
export async function createDeviceCrystal(intent: string) {
  const original = intent.trim().slice(0, 4000);
  if (!original) throw new Error("An intent is required.");
  if ((await listDeviceCrystals()).length >= MAX)
    throw new Error("This Library Card has reached the 128-crystal storage limit.");
  const now = new Date().toISOString();
  return write({
    id: crypto.randomUUID(), intent: original,
    createdAt: now, updatedAt: now,
    verifiedRevision: null, verifiedAt: null,
    verifiedGrowthCount: 0, developing: false,
    drafts: [], queuedJobId: null, lastLocalJobAt: null,
  });
}
export async function markDeviceJob(id: string, jobId: string) {
  if (!/^[a-f0-9-]{36}$/.test(jobId)) throw new Error("Invalid device job.");
  const record = await byId(id);
  record.queuedJobId = jobId;
  record.developing = true;
  record.lastLocalJobAt = new Date().toISOString();
  record.updatedAt = record.lastLocalJobAt;
  return write(record);
}
export async function appendDeviceDraft(
  id: string, development: LocalDevelopment,
) {
  if (!development.content.trim() || !/^[a-f0-9-]{36}$/.test(development.jobId))
    throw new Error("Invalid local result.");
  if (development.status !== "unverified_local_draft")
    throw new Error("A local AI draft must never be treated as verified knowledge.");
  const record = await byId(id);
  if (!record.drafts.some(draft => draft.jobId === development.jobId))
    record.drafts = [...record.drafts, development].slice(-64);
  record.queuedJobId = null;
  record.developing = false;
  record.updatedAt = development.recordedAt;
  // No fake verified revision or growth.
  return write(record);
}
export async function failDeviceJob(id: string, jobId: string) {
  const record = await byId(id);
  if (record.queuedJobId === jobId) {
    record.queuedJobId = null;
    record.developing = false;
    record.updatedAt = new Date().toISOString();
    await write(record);
  }
}
