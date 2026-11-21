/**
 * Each crystal is one continuing intent. The record is stored in the owner's
 * configured persistent storage, never in an in-memory substitute.
 * The client has an unguessable Library Card capability, not guest run tokens.
 * Real evolution still requires the governed engine to record new work.
 */
import { createServerFn } from "@tanstack/react-start";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { governedPersisted } from "./result-model";
import { projectGuestDelivery } from "./guest.functions";
import type { ObjectiveRun } from "./objectives.functions";

type StoredCrystal = {
  id: string;
  intent: string;
  requestId: string;
  guestToken: string;
  createdAt: string;
  updatedAt: string;
  verifiedRevision: number | null;
  verifiedAt: string | null;
};
export type CrystalSummary = Pick<StoredCrystal,
  "id" | "intent" | "createdAt" | "updatedAt" | "verifiedRevision" | "verifiedAt">;

function keyOf(value: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value || "")) throw new Error("A valid Library Card key is required.");
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}
function uuid(value: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(value || "")) throw new Error("Invalid intent crystal identifier.");
  return value;
}
function directory(): string {
  const root = process.env["ASCENSION_STORAGE_DIR"]?.trim() || "";
  if (!root || !path.isAbsolute(root))
    throw new Error("Persistent ASCENSION_STORAGE_DIR is required for growing intent crystals.");
  return path.join(root, "intent-crystals");
}
async function load(libraryKey: string): Promise<StoredCrystal[]> {
  const file = path.join(directory(), keyOf(libraryKey) + ".json");
  try {
    const records: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    if (!Array.isArray(records)) throw new Error("Invalid intent crystal ledger.");
    return records as StoredCrystal[];
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }
}
async function store(libraryKey: string, items: StoredCrystal[]) {
  const root = directory();
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const filename = path.join(root, keyOf(libraryKey) + ".json");
  const pending = filename + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(pending, JSON.stringify(items), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(pending, filename);
  } finally {
    await fs.unlink(pending).catch(() => {});
  }
}
const summary = (item: StoredCrystal): CrystalSummary => ({
  id: item.id, intent: item.intent, createdAt: item.createdAt,
  updatedAt: item.updatedAt, verifiedRevision: item.verifiedRevision,
  verifiedAt: item.verifiedAt,
});
async function runFor(item: StoredCrystal): Promise<ObjectiveRun | null> {
  const volume = await import("./data/volume-transport.server");
  if (volume.ownerVolumeTransportEnabled()) {
    const data = await volume.callOwnerVolumeTransport<{request: ObjectiveRun | null}>(
      "/guest/status", "POST", { requestId: item.requestId, guestToken: item.guestToken });
    return data.request ?? null;
  }
  const { ascensionDb } = await import("./data/client.server");
  const response = await ascensionDb.rpc("ascension_guest_status", {
    p_request_id: item.requestId, p_guest_token: item.guestToken });
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? null) as ObjectiveRun | null;
}
export const listIntentCrystals = createServerFn({ method: "GET" })
  .inputValidator((input: { libraryKey: string }) => ({ libraryKey: input.libraryKey }))
  .handler(async ({ data }) => (await load(data.libraryKey)).map(summary));

export const recordIntentCrystal = createServerFn({ method: "POST" })
  .inputValidator((input: {
    libraryKey: string; intent: string; requestId: string; guestToken: string; crystalId?: string;
  }) => ({
    libraryKey: input.libraryKey,
    intent: input.intent.trim().slice(0, 4000),
    requestId: uuid(input.requestId),
    guestToken: uuid(input.guestToken),
    crystalId: input.crystalId ? uuid(input.crystalId) : null,
  }))
  .handler(async ({ data }) => {
    if (!data.intent) throw new Error("The intent cannot be empty.");
    // Verify the supplied run capability before associating it with this Library Card.
    const confirmed = await runFor({
      id: data.crystalId || randomUUID(), intent: data.intent,
      requestId: data.requestId, guestToken: data.guestToken,
      createdAt: "", updatedAt: "", verifiedRevision: null, verifiedAt: null,
    });
    if (!confirmed) throw new Error("The original governed run was not found.");
    const items = await load(data.libraryKey);
    const now = new Date().toISOString();
    const existing = data.crystalId ? items.find(item => item.id === data.crystalId) : null;
    if (data.crystalId && !existing) throw new Error("That crystal is not on this Library Card.");
    const item: StoredCrystal = existing ?? {
      id: randomUUID(), intent: data.intent, requestId: data.requestId,
      guestToken: data.guestToken, createdAt: now, updatedAt: now,
      verifiedRevision: null, verifiedAt: null,
    };
    item.requestId = data.requestId;
    item.guestToken = data.guestToken;
    item.updatedAt = now;
    if (!existing) {
      if (items.length >= 128) throw new Error("Library Card crystal limit reached.");
      items.push(item);
    }
    await store(data.libraryKey, items);
    return summary(item);
  });

export const inspectIntentCrystal = createServerFn({ method: "GET" })
  .inputValidator((input: { libraryKey: string; crystalId: string }) => ({
    libraryKey: input.libraryKey, crystalId: uuid(input.crystalId),
  }))
  .handler(async ({ data }) => {
    const items = await load(data.libraryKey);
    const item = items.find(value => value.id === data.crystalId);
    if (!item) throw new Error("That intent is not on this Library Card.");
    const run = await runFor(item);
    if (!run) return { crystal: summary(item), status: "unavailable", delivery: null };
    const complete = run.status === "verified";
    const delivery = complete ? await projectGuestDelivery(item.requestId, item.guestToken, false) : null;
    if (complete && governedPersisted(run) && typeof run.runtime_revision === "number" &&
      Number.isInteger(run.runtime_revision) && run.runtime_revision > 0 &&
      item.verifiedRevision !== run.runtime_revision) {
      item.verifiedRevision = run.runtime_revision;
      item.verifiedAt = run.completed_at ?? new Date().toISOString();
      item.updatedAt = new Date().toISOString();
      await store(data.libraryKey, items);
    }
    return {
      crystal: summary(item),
      status: run.status,
      // Only governed completed delivery is presented as an answer.
      delivery: delivery?.status === "completed" && delivery.source === "governed"
        ? delivery.response_payload : null,
    };
  });
