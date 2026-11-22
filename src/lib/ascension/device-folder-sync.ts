/**
 * Owner-controlled, local-first encrypted folder exchange for ASCENSION.
 *
 * No server, cloud account, remote endpoint, or automatic folder selection.
 * The owner explicitly chooses a directory (for example an OS-mapped private
 * network share or removable drive) and enters the SAME backup passphrase on
 * each device. Only AES-GCM encrypted archives are written. Each installation
 * writes its own uniquely named file, so devices never overwrite peer files.
 *
 * Runs while this browser page remains open and permission remains granted.
 * Does not claim unattended mobile execution, internet sync or persistent
 * password storage. The password is held only in a live session closure.
 */
import {
  createEncryptedLibraryBackup,
  restoreEncryptedLibraryBackup,
} from "./device-backup";

const DEVICE_ID_KEY = "ascension-local-sync-device-id-v1";
const SYNC_PREFIX = "ASCENSION-Private-Sync-";
const SYNC_SUFFIX = ".ascension";
const INTERVAL_MS = 180_000;
const MAX_PEERS = 16;
const MAX_PEER_FILE_BYTES = 64 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SyncSummary = {
  importedCrystals: number;
  mergedDrafts: number;
  mergedGovernedResults: number;
  peersRead: number;
  scannedAt: string;
};
export type SyncStatus =
  | { state: "synchronizing" }
  | { state: "ready"; summary: SyncSummary }
  | { state: "error"; message: string };

export type WritableDeviceFile = {
  write(value: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
};
export type DeviceSyncFile = {
  kind: "file";
  getFile(): Promise<File>;
  createWritable(): Promise<WritableDeviceFile>;
};
export type DeviceSyncFolder = {
  entries(): AsyncIterable<[string, { kind: string }]>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<DeviceSyncFile>;
  removeEntry?(name: string): Promise<void>;
};
export type FolderSyncSession = {
  syncNow(): Promise<SyncSummary>;
  stop(): void;
};

export function deviceSyncFileName(id: string): string {
  if (!UUID_RE.test(id)) throw new Error("Invalid ASCENSION device sync identifier.");
  return SYNC_PREFIX + id.toLowerCase() + SYNC_SUFFIX;
}

export function getOrCreateSyncDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && UUID_RE.test(existing)) return existing.toLowerCase();
  if (!crypto?.randomUUID) throw new Error("This browser cannot create a private sync device identifier.");
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
function isOtherDeviceArchive(filename: string, ownFilename: string) {
  if (filename === ownFilename) return false;
  if (!filename.startsWith(SYNC_PREFIX) || !filename.endsWith(SYNC_SUFFIX)) return false;
  const deviceId = filename.slice(SYNC_PREFIX.length, -SYNC_SUFFIX.length);
  return UUID_RE.test(deviceId) && deviceSyncFileName(deviceId) === filename;
}
function allowedPassphrase(passphrase: string) {
  if (typeof passphrase !== "string" || passphrase.length < 12 || passphrase.length > 256)
    throw new Error("Private sync passphrase must be 12–256 characters.");
}
export function supportsFolderSync() {
  return typeof window !== "undefined" &&
    typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}
export async function chooseOwnerSyncFolder(): Promise<DeviceSyncFolder> {
  const browser = window as Window & {
    showDirectoryPicker?: (options?: { mode?: "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  };
  if (!browser.showDirectoryPicker)
    throw new Error("This browser cannot access a user-chosen folder. Use encrypted Library Card export and restore instead.");
  // Must run directly in the owner's button-press handler: browsers require
  // transient user activation before displaying native filesystem permission.
  const folder = await browser.showDirectoryPicker({ mode: "readwrite" });
  return folder as unknown as DeviceSyncFolder;
}

/**
 * All peer archives must authenticate and merge before writing this device's
 * encrypted snapshot. Invalid/tampered archives NEVER replace valid peer data.
 * A peer directory is an OWNER-CHOSEN transfer medium, not a service we host.
 */
export function startOwnerFolderSync(
  folder: DeviceSyncFolder,
  passphrase: string,
  onStatus: (state: SyncStatus) => void,
  onImported?: () => Promise<unknown>,
  intervalMs = INTERVAL_MS,
): FolderSyncSession {
  allowedPassphrase(passphrase);
  if (!folder || typeof folder.entries !== "function" || typeof folder.getFileHandle !== "function")
    throw new Error("A permitted owner-controlled sync folder is required.");
  const ownName = deviceSyncFileName(getOrCreateSyncDeviceId());
  let running = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSummary: SyncSummary | null = null;

  const syncNow = async (): Promise<SyncSummary> => {
    if (stopped) throw new Error("This owner-controlled sync session was stopped.");
    if (running) {
      if (lastSummary) return lastSummary;
      throw new Error("The Library Card is already synchronizing.");
    }
    running = true;
    onStatus({ state: "synchronizing" });
    try {
      let importedCrystals = 0;
      let mergedDrafts = 0;
      let mergedGovernedResults = 0;
      const peers: string[] = [];
      for await (const [name, entry] of folder.entries()) {
        if (entry.kind === "file" && isOtherDeviceArchive(name, ownName)) {
          peers.push(name);
          if (peers.length > MAX_PEERS)
            throw new Error("More than 16 peer archives were found. Choose a dedicated private sync folder.");
        }
      }
      // Stable iteration makes replay, failures and test results reproducible.
      peers.sort();
      for (const name of peers) {
        if (stopped) throw new Error("The sync session was stopped.");
        const handle = await folder.getFileHandle(name);
        const file = await handle.getFile();
        if (file.size > MAX_PEER_FILE_BYTES || file.size < 100)
          throw new Error("A peer's encrypted archive has an invalid size.");
        // No passphrase, browser CryptoKey or device capability is placed in the
        // folder. AES-GCM authenticates each archive before the local merge.
        const result = await restoreEncryptedLibraryBackup(
          await file.text(), passphrase, { restoreCompanion: false });
        importedCrystals += result.imported;
        mergedDrafts += result.mergedDrafts ?? 0;
        mergedGovernedResults += result.mergedGovernedResults ?? 0;
      }
      if (stopped) throw new Error("The sync session was stopped.");
      if ((importedCrystals || mergedDrafts || mergedGovernedResults) && onImported)
        await onImported();

      // Re-export the complete locally merged state for other devices.
      // Never write any other installation's file.
      const encrypted = await createEncryptedLibraryBackup(passphrase);
      const selfHandle = await folder.getFileHandle(ownName, { create: true });
      const writer = await selfHandle.createWritable();
      try {
        await writer.write(encrypted);
        await writer.close();
      } catch (error) {
        try { await writer.abort?.(); } catch { /* Preserve original failure. */ }
        throw error;
      }
      lastSummary = {
        importedCrystals,
        mergedDrafts,
        mergedGovernedResults,
        peersRead: peers.length,
        scannedAt: new Date().toISOString(),
      };
      onStatus({ state: "ready", summary: lastSummary });
      return lastSummary;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Encrypted device sync could not complete.";
      onStatus({ state: "error", message });
      throw error;
    } finally {
      running = false;
    }
  };

  const session: FolderSyncSession = {
    syncNow,
    stop() {
      stopped = true;
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
  // Browser timers can be throttled or suspended by the operating system.
  // Repeat only while the owner keeps this app open and the tab visible.
  timer = setInterval(() => {
    if (!stopped && !running && document.visibilityState === "visible") {
      void syncNow().catch(() => { /* Status callback displays the failure. */ });
    }
  }, Math.max(30_000, intervalMs));
  return session;
}
