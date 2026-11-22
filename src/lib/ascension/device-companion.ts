/**
 * Optional loopback-only AI companion. User crystal data is saved to device
 * IndexedDB before contacting this service. If it is unavailable, the intent
 * stays local and is NOT secretly submitted to a central ASCENSION server.
 */
import {
  appendDeviceDraft, createDeviceCrystal, deviceCardId, failDeviceJob,
  listDeviceCrystals, markDeviceJob, readDeviceCrystal,
  type DeviceCrystal,
} from "./device-knowledgeverse";

const ENDPOINT = "http://127.0.0.1:8788";
type DeviceJob = {
  id: string;
  status: "queued" | "running" | "completed" | "blocked";
  model: string | null;
  result: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};
type RemoteCrystal = {
  id: string;
  intent: string;
  createdAt: string;
  updatedAt: string;
  jobs: DeviceJob[];
};
type LibraryState = { crystals: RemoteCrystal[] };

async function companionRequest<T>(route: "/v1/library" | "/v1/submit", body: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1700);
  try {
    const response = await fetch(ENDPOINT + route, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(result.error || "The local device companion rejected the request.");
    return result;
  } finally {
    clearTimeout(timer);
  }
}
export type LocalJobSubmission = { jobId: string; status: "queued" };
export async function submitDeviceComputation(crystal: DeviceCrystal, instruction: string) {
  const response = await companionRequest<LocalJobSubmission>("/v1/submit", {
    libraryKey: deviceCardId(), crystalId: crystal.id, intent: crystal.intent,
    instruction: instruction.trim().slice(0, 4000),
  });
  await markDeviceJob(crystal.id, response.jobId);
  return response;
}

/**
 * The companion's SQLite output is a user-device draft, never governed proof.
 * Synchronization only mirrors completed, model-attributed results for crystals
 * owned by the same Library Card. It never increases a verified growth counter.
 */
export async function synchronizeDeviceCompanion(): Promise<number> {
  const remote = await companionRequest<LibraryState>("/v1/library", {
    libraryKey: deviceCardId(),
  });
  const local = await listDeviceCrystals();
  const lookup = new Map(local.map(crystal => [crystal.id, crystal]));
  let newDrafts = 0;
  for (const item of remote.crystals) {
    const own = lookup.get(item.id);
    if (!own || own.intent !== item.intent) continue;
    for (const job of item.jobs) {
      if (job.status === "completed" && job.result?.trim() && job.model &&
          !own.drafts.some(draft => draft.jobId === job.id)) {
        await appendDeviceDraft(item.id, {
          jobId: job.id,
          recordedAt: job.finished_at || job.created_at,
          model: job.model, content: job.result.trim(),
          status: "unverified_local_draft",
        });
        own.drafts.push({
          jobId: job.id, recordedAt: job.finished_at || job.created_at,
          model: job.model, content: job.result.trim(), status: "unverified_local_draft",
        });
        newDrafts++;
      } else if ((job.status === "running" || job.status === "queued") &&
                 own.queuedJobId !== job.id) {
        await markDeviceJob(item.id, job.id);
        own.queuedJobId = job.id;
      } else if (job.status === "blocked" && own.queuedJobId === job.id) {
        await failDeviceJob(item.id, job.id);
        own.queuedJobId = null;
      }
    }
  }
  return newDrafts;
}
export async function startDeviceIntent(intent: string) {
  const crystal = await createDeviceCrystal(intent);
  try {
    await submitDeviceComputation(crystal, crystal.intent);
    return { crystal, submitted: true };
  } catch {
    // The user still owns the saved intent. No remote fallback or invented work.
    return { crystal, submitted: false };
  }
}
export async function continueDeviceIntent(crystalId: string, instruction: string) {
  const crystal = await readDeviceCrystal(crystalId);
  return submitDeviceComputation(crystal, instruction);
}
