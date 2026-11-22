/**
 * A crystal is a persistent owner intent and a sequence of real governed runs.
 * Library Card capability remains local to the browser until account identity
 * is integrated. Never invent a result or attribute progress to a draft.
 */
import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { governedPersisted } from "./result-model";
import { projectGuestDelivery } from "./guest.functions";
import type { ObjectiveRun } from "./objectives.functions";
import {
  crystalLedgerFilename, readCrystalLedger, withCrystalLedgerLock,
  saveCrystalLedger, appendVerifiedSnapshot,
  type IntentCrystalRecord, type VerifiedCrystalSnapshot,
} from "./intent-crystal-ledger.server";

export type CrystalSummary = Pick<IntentCrystalRecord,
  "id" | "intent" | "createdAt" | "updatedAt" | "verifiedRevision" | "verifiedAt"> & {
    verifiedGrowthCount: number;
    developing: boolean;
  };
function uuid(value: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(value ?? ""))
    throw new Error("Invalid intent or governed run identifier.");
  return value;
}
const toSummary = (record: IntentCrystalRecord): CrystalSummary => ({
  id: record.id, intent: record.intent, createdAt: record.createdAt,
  updatedAt: record.updatedAt, verifiedRevision: record.verifiedRevision,
  verifiedAt: record.verifiedAt,
  verifiedGrowthCount: record.history?.length ?? (record.lastVerified ? 1 : 0),
  developing: Boolean(record.lastAutoQueuedAt && record.requestId !== record.lastVerified?.requestId),
});
async function runFor(requestId: string, guestToken: string): Promise<ObjectiveRun | null> {
  const volume = await import("./data/volume-transport.server");
  if (volume.ownerVolumeTransportEnabled()) {
    const response = await volume.callOwnerVolumeTransport<{ request: ObjectiveRun | null }>(
      "/guest/status", "POST", { requestId, guestToken });
    return response.request ?? null;
  }
  const { ascensionDb } = await import("./data/client.server");
  const response = await ascensionDb.rpc("ascension_guest_status", {
    p_request_id: requestId, p_guest_token: guestToken,
  });
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? null) as ObjectiveRun | null;
}
async function verifiedDelivery(requestId: string, guestToken: string) {
  const delivered = await projectGuestDelivery(requestId, guestToken, false);
  return delivered?.status === "completed" && delivered.source === "governed" &&
    delivered.response_payload?.kind !== "not_produced" &&
    Boolean(delivered.response_payload?.body.trim())
    ? delivered.response_payload : null;
}
function snapshotFor(run: ObjectiveRun, requestId: string, guestToken: string): VerifiedCrystalSnapshot | null {
  return governedPersisted(run) && typeof run.runtime_revision === "number" &&
    Number.isInteger(run.runtime_revision) && run.runtime_revision > 0
    ? {
        requestId, guestToken, revision: run.runtime_revision,
        completedAt: run.completed_at || run.updated_at || new Date().toISOString(),
      }
    : null;
}

export const listIntentCrystals = createServerFn({ method: "GET" })
  .inputValidator((input: { libraryKey: string }) => ({
    libraryKey: input.libraryKey,
  }))
  .handler(async ({ data }) =>
    (await readCrystalLedger(crystalLedgerFilename(data.libraryKey))).map(toSummary));

export const recordIntentCrystal = createServerFn({ method: "POST" })
  .inputValidator((input: {
    libraryKey: string; intent: string; requestId: string; guestToken: string;
    crystalId?: string; parentRequestId?: string;
  }) => ({
    libraryKey: input.libraryKey,
    intent: input.intent.trim().slice(0, 4000),
    requestId: uuid(input.requestId),
    guestToken: uuid(input.guestToken),
    crystalId: input.crystalId ? uuid(input.crystalId) : null,
    parentRequestId: input.parentRequestId ? uuid(input.parentRequestId) : null,
  }))
  .handler(async ({ data }) => {
    if (!data.intent) throw new Error("An intent is required.");
    const confirmed = await runFor(data.requestId, data.guestToken);
    if (!confirmed) throw new Error("The original governed run was not found.");

    const filename = crystalLedgerFilename(data.libraryKey);
    return withCrystalLedgerLock(filename, async records => {
      const previous = data.crystalId ? records.find(item => item.id === data.crystalId) : null;
      if (data.crystalId && !previous)
        throw new Error("That intent crystal is not associated with this Library Card.");
      if (previous && (!data.parentRequestId ||
          data.parentRequestId !== previous.requestId))
        throw new Error("The intent has evolved since this continuation began. Recall the latest crystal first.");
      if (!previous && records.length >= 128)
        throw new Error("Library Card intent crystal limit reached.");
      const now = new Date().toISOString();
      const crystal: IntentCrystalRecord = previous ?? {
        id: randomUUID(), intent: data.intent,
        requestId: data.requestId, guestToken: data.guestToken,
        createdAt: now, updatedAt: now,
        verifiedRevision: null, verifiedAt: null,
      };

      // Preserve any verified answer already shown to the visitor before a
      // manual continuation makes its latest run pending.
      if (previous && !previous.lastVerified) {
        const prior = await runFor(previous.requestId, previous.guestToken);
        const last = prior ? snapshotFor(prior, previous.requestId, previous.guestToken) : null;
        if (last && await verifiedDelivery(last.requestId, last.guestToken))
          appendVerifiedSnapshot(crystal, last);
      }
      crystal.requestId = data.requestId;
      crystal.guestToken = data.guestToken;
      crystal.updatedAt = now;
      if (!previous) records.push(crystal);
      await saveCrystalLedger(filename, records);
      return toSummary(crystal);
    });
  });

export const inspectIntentCrystal = createServerFn({ method: "GET" })
  .inputValidator((input: { libraryKey: string; crystalId: string }) => ({
    libraryKey: input.libraryKey, crystalId: uuid(input.crystalId),
  }))
  .handler(async ({ data }) => {
    const filename = crystalLedgerFilename(data.libraryKey);
    const item = (await readCrystalLedger(filename))
      .find(record => record.id === data.crystalId);
    if (!item) throw new Error("This intent is not associated with the Library Card.");

    const run = await runFor(item.requestId, item.guestToken);
    const status = run?.status ?? "unavailable";
    const current = run?.status === "verified"
      ? await verifiedDelivery(item.requestId, item.guestToken) : null;

    // Only a published, governed delivery is added to growth history. A
    // submitted continuation is not counted as an achieved discovery.
    const latestVerified = run && current
      ? snapshotFor(run, item.requestId, item.guestToken) : null;
    let summary = toSummary(item);
    if (latestVerified && item.lastVerified?.requestId !== item.requestId) {
      summary = await withCrystalLedgerLock(filename, async records => {
        const actual = records.find(record => record.id === data.crystalId);
        if (!actual) throw new Error("Intent crystal disappeared during inspection.");
        if (actual.requestId === item.requestId) {
          appendVerifiedSnapshot(actual, latestVerified);
          actual.updatedAt = new Date().toISOString();
          await saveCrystalLedger(filename, records);
        }
        return toSummary(actual);
      });
    }
    let presented = current;
    // Do not hide an existing verified creation while the next governed
    // development is still running in the background.
    if (!presented && item.lastVerified) {
      const stable = await runFor(item.lastVerified.requestId, item.lastVerified.guestToken);
      if (stable && governedPersisted(stable))
        presented = await verifiedDelivery(item.lastVerified.requestId, item.lastVerified.guestToken);
    }
    return {
      crystal: summary, status,
      continuation: { requestId: item.requestId, guestToken: item.guestToken },
      delivery: presented,
    };
  });
