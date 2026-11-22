import {
  createDeviceCrystal, listDeviceCrystals, readDeviceCrystal,
  markDeviceJob, appendDeviceDraft, importDeviceCrystals,
} from "../../src/lib/ascension/device-knowledgeverse";
import { createEncryptedLibraryBackup, restoreEncryptedLibraryBackup } from "../../src/lib/ascension/device-backup";

Object.assign(window, {
  deviceTestAPI: {
    createDeviceCrystal,
    listDeviceCrystals,
    readDeviceCrystal,
    markDeviceJob,
    appendDeviceDraft,
    createEncryptedLibraryBackup,
    restoreEncryptedLibraryBackup,
    importDeviceCrystals,
  },
});
