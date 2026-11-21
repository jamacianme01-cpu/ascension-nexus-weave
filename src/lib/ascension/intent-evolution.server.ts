/**
 * Owner-approved autonomous intent growth.
 *
 * The scheduler queues bounded follow-up work for a REAL persisted, governed
 * result. It does not invent discoveries, alter user-approved designs, call
 * external answer vendors, or upgrade a draft to "verified".
 *
 * Production activation requires an always-on server process, persistent
 * ASCENSION_STORAGE_DIR, the existing governed runtime and
 * ASCENSION_ENABLE_CRYSTAL_EVOLUTION=true.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { callOwnerVolumeTransport, ownerVolumeTransportEnabled } from "./data/volume-transport.server";
import { ascensionDb } from "./data/client.server";
import { projectGuestDelivery, type GuestSubmission } from "./guest.functions";
import { governedPersisted } from "./result-model";
import type { ObjectiveRun } from "./objectives.functions";

type EvolutionCrystal = {
  id: string;
  intent: string;
  requestId: string;
  guestToken: string;
  createdAt: string;
  updatedAt: string;
  verifiedRevision: number | null;
  verifiedAt: string | null;
  lastAutoQueuedAt?: string;
};
export type EvolutionCycleReport = {
  scanned: number;
  queued: number;
  skipped: number;
  failures: number;
  enabled: boolean;
};
const MINIMUM_INTERVAL_MS = 12 * 60 * 60 * 1000;
const MAX_QUEUE_PER_CYCLE = 2;
function storageFolder(): string | null {
  const root = process.env["ASCENSION_STORAGE_DIR"]?.trim();
  return root && path.isAbsolute(root) ? path.join(root, "intent-crystals") : null;
}
function evolutionEnabled(): boolean {
  return process.env["ASCENSION_ENABLE_CRYSTAL_EVOLUTION"] === "true" &&
    Boolean(storageFolder());
}
function validRecord(value: unknown): value is EvolutionCrystal {
  const x = value as Partial<EvolutionCrystal> | null;
  return !!x && typeof x.intent === "string" && typeof x.id === "string" &&
    /^[a-f0-9-]{36}$/i.test(x.id) &&
    typeof x.requestId === "string" && /^[a-f0-9-]{36}$/i.test(x.requestId) &&
    typeof x.guestToken === "string" && /^[a-f0-9-]{36}$/i.test(x.guestToken);
}
async function governedStatus(item: EvolutionCrystal): Promise<ObjectiveRun | null> {
  if (ownerVolumeTransportEnabled()) {
    const response = await callOwnerVolumeTransport<{request: ObjectiveRun | null}>(
      "/guest/status", "POST", { requestId: item.requestId, guestToken: item.guestToken });
    return response.request ?? null;
  }
  const response = await ascensionDb.rpc("ascension_guest_status", {
    p_request_id: item.requestId, p_guest_token: item.guestToken });
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? null) as ObjectiveRun | null;
}
async function queueContinuation(item: EvolutionCrystal): Promise<GuestSubmission> {
  const original = item.intent.slice(0, 2000);
  const objective = [
    "Continue developing the existing owner intent without changing its approved design.",
    "Investigate one new evidence-grounded connection, testable implication, limitation,",
    "or improvement opportunity. Clearly distinguish suggestions from verified findings.",
    "Do not perform physical actions, alter approved specifications, or claim verification.",
    "Original continuing intent: " + original,
  ].join(" ").slice(0, 4000);
  const evidence = [JSON.stringify({
    source: "ASCENSION_AUTONOMOUS_INTENT_CONTINUATION",
    crystal_id: item.id,
    original_intent: original,
    parent_request_id: item.requestId,
    prior_revision: item.verifiedRevision,
    approval_boundary: "PRESERVE_ORIGINAL_SPEC",
  }).slice(0, 2000)];
  if (ownerVolumeTransportEnabled()) {
    return callOwnerVolumeTransport<GuestSubmission>("/guest/submit", "POST", {
      objective, evidence, constraints: null,
      parentRequestId: item.requestId, parentGuestToken: item.guestToken,
      followUp: "continue",
    });
  }
  const response = await ascensionDb.rpc("ascension_guest_submit", {
    p_objective: objective,
    p_evidence: evidence,
    p_constraints: null,
    p_parent_request_id: item.requestId,
    p_parent_guest_token: item.guestToken,
    p_follow_up: "continue",
  });
  if (response.error) throw new Error(response.error.message);
  const row = response.data as { request?: { id?: string }; guest_token?: string } | null;
  if (!row?.request?.id || !row.guest_token) throw new Error("No governed continuation was queued.");
  return { request: row.request as GuestSubmission["request"], guestToken: row.guest_token };
}
async function updateLedger(filename: string, records: EvolutionCrystal[]) {
  const pending = filename + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(pending, JSON.stringify(records), {encoding:"utf8",mode:0o600,flag:"wx"});
    await fs.rename(pending, filename);
  } finally {
    await fs.unlink(pending).catch(() => {});
  }
}
function nextEligible(record: EvolutionCrystal, run: ObjectiveRun, now: number) {
  if (run.status !== "verified" || !governedPersisted(run)) return false;
  const completed = Date.parse(run.completed_at || run.updated_at || "");
  if (!Number.isFinite(completed) || now - completed < MINIMUM_INTERVAL_MS) return false;
  const last = record.lastAutoQueuedAt ? Date.parse(record.lastAutoQueuedAt) : 0;
  return !last || (Number.isFinite(last) && now - last >= MINIMUM_INTERVAL_MS);
}
export async function advanceIntentCrystalsOnce(now = Date.now()): Promise<EvolutionCycleReport> {
  const report: EvolutionCycleReport = {
    scanned: 0, queued: 0, skipped: 0, failures: 0, enabled: evolutionEnabled(),
  };
  if (!report.enabled) return report;
  const folder = storageFolder()!;
  let entries: string[];
  try { entries = await fs.readdir(folder); }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return report;
    throw cause;
  }
  for (const entry of entries) {
    if (report.queued >= MAX_QUEUE_PER_CYCLE) break;
    if (!/^[a-f0-9]{64}\.json$/.test(entry)) continue;
    const filename = path.join(folder, entry);
    const lock = filename + ".evolve.lock";
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      // Claim before reading, submitting, or replacing the ledger.
      // Another process cannot simultaneously queue the same crystal.
      handle = await fs.open(lock, "wx", 0o600);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "EEXIST") { report.skipped++; continue; }
      report.failures++; continue;
    }
    try {
      const records = JSON.parse(await fs.readFile(filename, "utf8")) as unknown;
      if (!Array.isArray(records)) { report.failures++; continue; }
      for (const item of records) {
        if (report.queued >= MAX_QUEUE_PER_CYCLE) break;
        if (!validRecord(item)) { report.skipped++; continue; }
        report.scanned++;
        try {
          const run = await governedStatus(item);
          if (!run || !nextEligible(item, run, now)) { report.skipped++; continue; }
          // No autonomous continuation from a draft or an incomplete delivery.
          const delivery = await projectGuestDelivery(item.requestId, item.guestToken, false);
          if (delivery?.status !== "completed" || delivery.source !== "governed" ||
              !delivery.response_payload) { report.skipped++; continue; }
          const submitted = await queueContinuation(item);
          if (!submitted?.request?.id || !submitted.guestToken) throw new Error("Queue did not acknowledge intent.");
          item.requestId = submitted.request.id;
          item.guestToken = submitted.guestToken;
          item.lastAutoQueuedAt = new Date(now).toISOString();
          item.updatedAt = item.lastAutoQueuedAt;
          if (typeof run.runtime_revision === "number" && run.runtime_revision > 0) {
            item.verifiedRevision = run.runtime_revision;
            item.verifiedAt = run.completed_at || new Date(now).toISOString();
          }
          // Only successful governed queue submissions become ledger entries.
          await updateLedger(filename, records);
          report.queued++;
        } catch {
          report.failures++;
        }
      }
    } catch {
      report.failures++;
    } finally {
      await handle?.close();
      await fs.unlink(lock).catch(() => {});
    }
  }
  return report;
}
