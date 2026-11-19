/**
 * Private ASCENSION queue bridge to the owner's existing Fly worker volume.
 * This is transport only. Authored ASCENSION_CORE decides every governed result.
 * The bridge never creates a database or reinterprets Knowledgeverse state.
 *
 * Worker lifecycle: machines start at zero. On ENGAGE, this module wakes the
 * worker via the Fly Machines API, retries the transport call, and leaves the
 * worker running for the rest of the Tree session. Idle shutdown is session-tied,
 * not request-tied — the Tree stays with the user the whole time.
 */

const FLY_API = "https://api.fly.io/v1";
const APP_NAME = "ascension-nexus-weave";
const WORKER_PROCESS = "worker";

export function ownerVolumeTransportEnabled(): boolean {
  return Boolean(process.env["ASCENSION_VOLUME_TRANSPORT_URL"]?.trim());
}

type FlyMachine = {
  id: string;
  name: string;
  state: string;
  process_group: string;
  region: string;
  created_at: string;
  updated_at: string;
  checks: unknown;
  events: unknown;
  config: unknown;
  image_ref: unknown;
  instance_id: string;
  private_ip: string;
  region: string;
  state: string;
  updated_at: string;
};

async function flyMachines(): Promise<FlyMachine[]> {
  const token = process.env["FLY_API_TOKEN"]?.trim();
  if (!token) return [];
  const response = await fetch(`${FLY_API}/apps/${APP_NAME}/machines`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok) return [];
  const data = (await response.json()) as FlyMachine[];
  return Array.isArray(data) ? data : [];
}

async function startMachine(id: string): Promise<boolean> {
  const token = process.env["FLY_API_TOKEN"]?.trim();
  if (!token) return false;
  const response = await fetch(`${FLY_API}/apps/${APP_NAME}/machines/${id}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  return response.ok || response.status === 409;
}

async function ensureWorkerAwake(): Promise<void> {
  const machines = await flyMachines();
  const workers = machines.filter((m) => m.process_group === WORKER_PROCESS);
  const running = workers.filter((m) => m.state === "started");
  if (running.length > 0) return;

  const stopped = workers.filter((m) => m.state === "stopped" || m.state === "created");
  if (stopped.length === 0) {
    // No worker machine exists at all — nothing to wake.
    return;
  }

  // Start every stopped worker machine. They share the persistent volume,
  // so any one answering is enough; starting all avoids a race where the
  // one we picked is slow and ENGAGE times out before it binds :9091.
  await Promise.all(stopped.map((m) => startMachine(m.id)));

  // Give the worker a moment to bind its port before the first transport call.
  await new Promise((r) => setTimeout(r, 2500));
}

export async function callOwnerVolumeTransport<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  const endpoint = process.env["ASCENSION_VOLUME_TRANSPORT_URL"]?.trim();
  const secret = process.env["ASCENSION_PUBLISH_TOKEN"]?.trim();
  if (!endpoint || !secret) {
    throw new Error("Owner's private ASCENSION queue transport is not configured on Fly.");
  }
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Invalid private ASCENSION transport path.");
  }

  // Wake the worker before the first attempt so ENOTFOUND doesn't happen
  // when auto-stop has scaled it to zero between Tree sessions.
  await ensureWorkerAwake();

  const url = new URL(path, endpoint.endsWith("/") ? endpoint : endpoint + "/");
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "X-Ascension-Publish-Token": secret,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const responseText = await response.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error("Owner's private ASCENSION worker returned a non-JSON response.");
  }
  if (!response.ok) {
    // One retry after a second wake attempt — covers the race where the
    // machine started but hadn't bound :9091 on the first try.
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      await ensureWorkerAwake();
      const retry = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          "X-Ascension-Publish-Token": secret,
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
      const retryText = await retry.text();
      let retryPayload: Record<string, unknown>;
      try {
        retryPayload = JSON.parse(retryText) as Record<string, unknown>;
      } catch {
        throw new Error("Owner's private ASCENSION worker returned a non-JSON response.");
      }
      if (!retry.ok) {
        const message = typeof retryPayload["error"] === "string" ? retryPayload["error"] : "Private owner transport failed.";
        throw new Error(message.slice(0, 300));
      }
      return retryPayload as T;
    }
    const message = typeof payload["error"] === "string" ? payload["error"] : "Private owner transport failed.";
    throw new Error(message.slice(0, 300));
  }
  return payload as T;
}
