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


/** Local-only portable restore. Never overwrite an existing user intent. */
function validIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 35 &&
    /^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}
function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validateImportedCrystal(value: unknown): DeviceCrystal {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("An archived crystal has an invalid structure.");
  const input = value as Partial<DeviceCrystal>;
  if (!validUuid(input.id) || typeof input.intent !== "string" ||
      !input.intent.trim() || input.intent.length > 4000 ||
      !validIsoDate(input.createdAt) || !validIsoDate(input.updatedAt) ||
      !Array.isArray(input.drafts) || input.drafts.length > 64 ||
      input.verifiedGrowthCount !== 0 || input.verifiedRevision !== null ||
      input.verifiedAt !== null)
    throw new Error("The archive contains a damaged crystal or unsupported verification claims.");
  const jobIds = new Set<string>();
  const drafts: LocalDevelopment[] = [];
  for (const candidate of input.drafts) {
    if (!candidate || typeof candidate !== "object" ||
        candidate.status !== "unverified_local_draft" ||
        !validUuid(candidate.jobId) || jobIds.has(candidate.jobId) ||
        !validIsoDate(candidate.recordedAt) ||
        typeof candidate.model !== "string" || !candidate.model.trim() ||
        candidate.model.length > 300 ||
        typeof candidate.content !== "string" || !candidate.content.trim() ||
        candidate.content.length > 50_000)
      throw new Error("The archive contains an invalid or duplicate local development.");
    jobIds.add(candidate.jobId);
    drafts.push({
      jobId: candidate.jobId, status: "unverified_local_draft",
      recordedAt: candidate.recordedAt,
      model: candidate.model, content: candidate.content,
    });
  }
  // Interrupted work cannot silently resume with old device credentials.
  return {
    id: input.id, intent: input.intent,
    createdAt: input.createdAt, updatedAt: input.updatedAt,
    drafts, verifiedRevision: null, verifiedAt: null,
    verifiedGrowthCount: 0, developing: false,
    queuedJobId: null, lastLocalJobAt: null,
  };
}

export async function importDeviceCrystals(
  values: unknown,
): Promise<{ imported: number; skipped: number }> {
  if (!Array.isArray(values) || values.length > MAX)
    throw new Error("Invalid archive crystal count.");
  const imported = values.map(validateImportedCrystal);
  const allIds = new Set<string>();
  for (const item of imported) {
    if (allIds.has(item.id)) throw new Error("An archive crystal is duplicated.");
    allIds.add(item.id);
  }
  // Read the same encrypted source records used for the transaction conflict
  // check. New drafts may be ADDED but existing originals are never replaced.
  const db = await database();
  const prefix = card() + ":";
  const onDisk = (await waitRequest<Envelope[]>(
    db.transaction(STORE, "readonly").objectStore(STORE).getAll()
  )).filter(value => value.id.startsWith(prefix));
  const existing = await Promise.all(onDisk.map(decrypt));
  const present = new Map(existing.map(record => [record.id, record]));
  const baselines = new Map(onDisk.map(value => [value.id, value]));
  const newlyAdded: DeviceCrystal[] = [];
  const merges: DeviceCrystal[] = [];
  let mergedDrafts = 0;
  let skipped = 0;
  for (const item of imported) {
    const previous = present.get(item.id);
    if (!previous) {
      newlyAdded.push(item);
      continue;
    }
    if (previous.intent !== item.intent)
      throw new Error("The archive conflicts with an existing original intent. Nothing was imported.");
    const prior = new Map(previous.drafts.map(draft => [draft.jobId, draft]));
    const additions: LocalDevelopment[] = [];
    for (const draft of item.drafts) {
      const match = prior.get(draft.jobId);
      if (match) {
        if (match.model !== draft.model || match.content !== draft.content ||
            match.recordedAt !== draft.recordedAt)
          throw new Error("A saved development conflicts with archive history. Nothing was imported.");
      } else {
        additions.push(draft);
        prior.set(draft.jobId, draft);
      }
    }
    if (!additions.length) {
      skipped++;
      continue;
    }
    if (prior.size > 64)
      throw new Error("Merging the archive would discard older developments. Nothing was imported.");
    const drafts = [...prior.values()].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    merges.push({
      ...previous, drafts,
      updatedAt: Date.parse(item.updatedAt) > Date.parse(previous.updatedAt)
        ? item.updatedAt : previous.updatedAt,
    });
    mergedDrafts += additions.length;
  }
  if (existing.length + newlyAdded.length > MAX)
    throw new Error("Restore would exceed the 128-crystal device limit. Nothing was imported.");

  // Encrypt under the receiving device's non-exportable key before opening a
  // write transaction. Every update is guarded against changes from other tabs.
  const toWrite = [...newlyAdded, ...merges];
  const envelopes = await Promise.all(toWrite.map(encrypt));
  if (!envelopes.length) return { imported: 0, skipped };
  const tx = db.transaction(STORE, "readwrite");
  const ready = transactionComplete(tx);
  const store = tx.objectStore(STORE);
  for (let i = 0; i < toWrite.length; i++) {
    const archived = toWrite[i]!;
    const envelope = envelopes[i]!;
    if (!present.has(archived.id)) {
      store.add(envelope); // Concurrent duplicates abort the entire transaction.
      continue;
    }
    const baseline = baselines.get(envelope.id);
    if (!baseline) {
      tx.abort();
      break;
    }
    const req = store.get(envelope.id);
    req.onsuccess = () => {
      const current = req.result as Envelope | undefined;
      if (!current ||
          current.iv.length !== baseline.iv.length ||
          current.cipher.length !== baseline.cipher.length ||
          current.iv.some((byte, pos) => byte !== baseline.iv[pos]) ||
          current.cipher.some((byte, pos) => byte !== baseline.cipher[pos])) {
        tx.abort();
      } else {
        store.put(envelope);
      }
    };
  }
  try { await ready; }
  catch {
    throw new Error("Restore encountered a concurrent device change. No archived crystals were overwritten.");
  }
  return {
    imported: newlyAdded.length, skipped,
    ...(mergedDrafts ? { mergedDrafts } : {}),
  };
}
