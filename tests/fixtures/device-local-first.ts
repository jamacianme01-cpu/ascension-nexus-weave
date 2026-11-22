import {
  createDeviceCrystal, listDeviceCrystals, readDeviceCrystal,
  markDeviceJob, appendDeviceDraft,
} from "../../src/lib/ascension/device-knowledgeverse";

Object.assign(window, {
  deviceTestAPI: {
    createDeviceCrystal,
    listDeviceCrystals,
    readDeviceCrystal,
    markDeviceJob,
    appendDeviceDraft,
  },
});
