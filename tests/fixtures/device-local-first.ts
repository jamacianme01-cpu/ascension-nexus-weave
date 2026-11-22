import {
  createDeviceCrystal, listDeviceCrystals, readDeviceCrystal,
  markDeviceJob, appendDeviceDraft, importDeviceCrystals,
  recordDeviceGovernedReceipt, selectDeviceGovernedResult,
} from "../../src/lib/ascension/device-knowledgeverse";
import { createEncryptedLibraryBackup, restoreEncryptedLibraryBackup } from "../../src/lib/ascension/device-backup";
import { startOwnerFolderSync, deviceSyncFileName, getOrCreateSyncDeviceId } from "../../src/lib/ascension/device-folder-sync";

/** In-memory native-folder stand-in; real AES/WebCrypto + IndexedDB remain active. */
function fakeSharedFolder(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const folder = {
    async *entries(): AsyncIterable<[string, { kind: string }]> {
      for (const name of files.keys()) yield [name, { kind: "file" }];
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name) && !options?.create)
        throw new Error("Missing peer archive: " + name);
      return {
        kind: "file" as const,
        async getFile() {
          const contents = files.get(name);
          if (contents === undefined) throw new Error("Missing archive: " + name);
          return new File([contents], name, { type: "application/octet-stream" });
        },
        async createWritable() {
          let staged: string | null = null;
          return {
            async write(data: Blob) { staged = await data.text(); },
            async close() {
              if (staged === null) throw new Error("No archive was staged.");
              files.set(name, staged);
            },
            async abort() { staged = null; },
          };
        },
      };
    },
  };
  return {
    folder,
    readFiles: () => Object.fromEntries(files.entries()),
    writeFiles: (records: Record<string, string>) => {
      for (const [name, contents] of Object.entries(records)) files.set(name, contents);
    },
  };
}


Object.assign(window, {
  deviceTestAPI: {
    createDeviceCrystal,
    listDeviceCrystals,
    readDeviceCrystal,
    markDeviceJob,
    appendDeviceDraft,
    recordDeviceGovernedReceipt,
    selectDeviceGovernedResult,
    createEncryptedLibraryBackup,
    restoreEncryptedLibraryBackup,
    importDeviceCrystals,
    startOwnerFolderSync,
    fakeSharedFolder,
    deviceSyncFileName,
    getOrCreateSyncDeviceId,
  },
});
