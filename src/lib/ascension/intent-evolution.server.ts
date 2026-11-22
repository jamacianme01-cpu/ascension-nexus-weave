/**
 * Owner-approved autonomous intent growth.
 *
 * The scheduler queues bounded follow-up work for a REAL persisted, governed
 * result. It does not invent discoveries, alter user-approved designs, call
 * external answer vendors, or upgrade a draft to "verified".
 *
 * Production activation requires an always-on server process, persistent
 * ASCENSION_STORAGE_DIR, the existing governed runtime and
 * ASCENSION_ENABLE_CRYSTAL_EVOLUTION not set to false.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { appendVerifiedSnapshot, crystalStorageFolder, readCrystalLedger, saveCrystalLedger,
  withCrystalLedgerLock, type IntentCrystalRecord } from "./intent-crystal-ledger.server";
import { callOwnerVolumeTransport, ownerVolumeTransportEnabled } from "./data/volume-transport.server";
import { ascensionDb } from "./data/client.server";
import { projectGuestDelivery, type GuestSubmission } from "./guest.functions";
import { governedPersisted } from "./result-model";
import type { ObjectiveRun } from "./objectives.functions";

export type EvolutionCycleReport = {
  scanned: number;
  queued: number;
  skipped: number;
  failures: number;
  enabled: boolean;
};
const MINIMUM_INTERVAL_MS = 12 * 60 * 60 * 1000;
const MAX_QUEUE_PER_CYCLE = 2;
/**
 * The owner approved independent growth. On the next configured owner-run
 * server process this is active automatically, unless explicitly disabled.
 * No external infrastructure or paid model is selected by this setting.
 */
export function crystalEvolutionEnabled(): boolean {
  if (process.env["ASCENSION_ENABLE_CRYSTAL_EVOLUTION"] === "false") return false;
  const root = process.env["ASCENSION_STORAGE_DIR"]?.trim() ?? "";
  const hasRuntime = Boolean(
    (process.env["ASCENSION_VOLUME_TRANSPORT_URL"]?.trim() &&
      process.env["ASCENSION_PUBLISH_TOKEN"]?.trim()) ||
    process.env["ASCENSION_DATABASE_URL"]?.trim() ||
    process.env["DATABASE_URL"]?.trim()
  );
  return path.isAbsolute(root) && hasRuntime;
}
function validRecord(value: unknown): value is IntentCrystalRecord {
  const record = value as Partial<IntentCrystalRecord> | null;
  return !!record && typeof record.intent === "string" &&
    typeof record.id === "string" && /^[a-f0-9-]{36}$/i.test(record.id) &&
    typeof record.requestId === "string" && /^[a-f0-9-]{36}$/i.test(record.requestId) &&
    typeof record.guestToken === "string" && /^[a-f0-9-]{36}$/i.test(record.guestToken);
}

async function governedStatus(item: IntentCrystalRecord): Promise<ObjectiveRun | null> {
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
async function queueContinuation(item: IntentCrystalRecord): Promise<GuestSubmission> {
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
function nextEligible(record: IntentCrystalRecord, run: ObjectiveRun, now: number) {
  if (run.status !== "verified" || !governedPersisted(run)) return false;
  const completed = Date.parse(run.completed_at || run.updated_at || "");
  if (!Number.isFinite(completed) || now - completed < MINIMUM_INTERVAL_MS) return false;
  const last = record.lastAutoQueuedAt ? Date.parse(record.lastAutoQueuedAt) : 0;
  return !last || (Number.isFinite(last) && now - last >= MINIMUM_INTERVAL_MS);
}
export async function advanceIntentCrystalsOnce(now = Date.now()): Promise<EvolutionCycleReport> {
  const report: EvolutionCycleReport = {
    scanned: 0, queued: 0, skipped: 0, failures: 0, enabled: crystalEvolutionEnabled(),
  };
  if (!report.enabled) return report;
  const folder = crystalStorageFolder();
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
    try {
      const handled = await withCrystalLedgerLock(filename, async records => {
        let queued = 0;
        let skipped = 0;
        let scanned = 0;
        let failures = 0;
        for (const item of records) {
          if (report.queued + queued >= MAX_QUEUE_PER_CYCLE) break;
          if (!validRecord(item)) { skipped++; continue; }
          scanned++;
          try {
            const run = await governedStatus(item);
            if (!run || !nextEligible(item, run, now)) { skipped++; continue; }
            // Do not continue an unverified answer or an external draft.
            const delivery = await projectGuestDelivery(item.requestId, item.guestToken, false);
            if (delivery?.status !== "completed" || delivery.source !== "governed" ||
                !delivery.response_payload || delivery.response_payload.kind === "not_produced" ||
                !delivery.response_payload.body.trim()) { skipped++; continue; }

            // The known-good answer remains available while its next result is
            // pending; no animation is used as proof of new discoveries.
            if (typeof run.runtime_revision !== "number" ||
                !Number.isInteger(run.runtime_revision) || run.runtime_revision <= 0) {
              skipped++; continue;
            }
            const prior = {
              requestId: item.requestId,
              guestToken: item.guestToken,
              revision: run.runtime_revision,
              completedAt: run.completed_at || run.updated_at || new Date(now).toISOString(),
            };
            const submitted = await queueContinuation(item);
            if (!submitted?.request?.id || !submitted.guestToken)
              throw new Error("The governed runtime did not accept a continuation.");
            appendVerifiedSnapshot(item, prior);
            item.requestId = submitted.request.id;
            item.guestToken = submitted.guestToken;
            item.lastAutoQueuedAt = new Date(now).toISOString();
            item.updatedAt = item.lastAutoQueuedAt;
            await saveCrystalLedger(filename, records);
            queued++;
          } catch {
            failures++;
          }
        }
        return { queued, skipped, scanned, failures };
      });
      report.queued += handled.queued;
      report.skipped += handled.skipped;
      report.scanned += handled.scanned;
      report.failures += handled.failures;
    } catch {
      report.failures++;
    }
  }
  return report;
}
