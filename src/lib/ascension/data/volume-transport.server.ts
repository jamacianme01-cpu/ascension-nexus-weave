/**
 * Private ASCENSION queue bridge to the owner's existing Fly worker volume.
 * This is transport only. Authored ASCENSION_CORE decides every governed result.
 * The bridge never creates a database or reinterprets Knowledgeverse state.
 *
 * Worker lifecycle: the original private worker machine already exists with its
 * volume. On ENGAGE this module may start that existing machine via the Fly
 * Machines API (never create a new one, never replace its image), retry the
 * transport call, and leave it running for the Tree session.
 */

const FLY_API = "https://api.machines.dev/v1";
const APP_NAME = "ascension-nexus-weave";
const WORKER_PROCESS = "worker";

/**
 * Owner's hybrid deployment may place the existing governed runtime on the
 * local computer instead of a Fly Machine. A local/private endpoint must never
 * require Fly credentials or create/start a Fly worker.
 *
 * Do not send the publish token over plaintext to a remote host. Oracle may
 * reach the owner's PC only through a separately secured HTTPS connection.
 */
function endpointRequiresFlyWake(endpoint: string): boolean {
  const url = new URL(endpoint);
  if (url.username || url.password) {
    throw new Error("ASCENSION transport URL must not contain credentials.");
  }
  const hostname = url.hostname.toLowerCase();
  const fly = hostname === "worker.process.ascension-nexus-weave.internal";
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  if (!fly && !(url.protocol === "https:" || (loopback && url.protocol === "http:"))) {
    throw new Error(
      "ASCENSION hybrid transport must use HTTPS, or HTTP bound to loopback on this computer.",
    );
  }
  return fly;
}

export function ownerVolumeTransportEnabled(): boolean {
  return Boolean(process.env["ASCENSION_VOLUME_TRANSPORT_URL"]?.trim());
}

type FlyMachine = {
  id: string;
  name?: string;
  state: string;
  /** Some API views expose this top-level; prefer config.metadata. */
  process_group?: string;
  region?: string;
  private_ip?: string;
  instance_id?: string;
  config?: {
    metadata?: {
      fly_process_group?: string;
      [key: string]: unknown;
    };
    mounts?: Array<{ volume?: string; path?: string }>;
    [key: string]: unknown;
  };
};

/** Prefer the same field the owner deploy workflows use. */
function machineProcessGroup(machine: FlyMachine): string {
  const fromMeta = machine.config?.metadata?.fly_process_group;
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  if (typeof machine.process_group === "string" && machine.process_group.trim()) {
    return machine.process_group.trim();
  }
  return "";
}

function machineHasVolume(machine: FlyMachine): boolean {
  const mounts = machine.config?.mounts;
  if (!Array.isArray(mounts)) return false;
  return mounts.some((m) => typeof m?.volume === "string" && m.volume.length > 0);
}

/**
 * Token used only to start an existing stopped worker machine.
 * Prefer ASCENSION_FLY_MACHINE_TOKEN (scoped deploy/org token).
 * FLY_API_TOKEN is accepted only if already present — this module never
 * invents or expands credentials.
 */
function machineApiToken(): string {
  return (
    process.env["ASCENSION_FLY_MACHINE_TOKEN"]?.trim() ||
    process.env["FLY_API_TOKEN"]?.trim() ||
    ""
  );
}

async function flyMachines(): Promise<FlyMachine[]> {
  const token = machineApiToken();
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
  const token = machineApiToken();
  if (!token) return false;
  const response = await fetch(`${FLY_API}/apps/${APP_NAME}/machines/${id}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  return response.ok || response.status === 409;
}

async function ensureWorkerAwake(): Promise<
  "running" | "started" | "no_machine" | "no_token" | "start_failed"
> {
  if (!machineApiToken()) return "no_token";

  const machines = await flyMachines();
  // Match activate-owner-fly-volume-queue.yml: worker process group + volume mount.
  const workers = machines.filter(
    (m) => machineProcessGroup(m) === WORKER_PROCESS && machineHasVolume(m),
  );
  const running = workers.filter((m) => m.state === "started");
  if (running.length > 0) return "running";

  const stopped = workers.filter(
    (m) => m.state === "stopped" || m.state === "created" || m.state === "suspended",
  );
  if (stopped.length === 0) {
    // Fall back to any worker process-group machine if volume metadata is missing
    // from the API view (should not happen for the original owner worker).
    const anyWorkers = machines.filter((m) => machineProcessGroup(m) === WORKER_PROCESS);
    const anyRunning = anyWorkers.filter((m) => m.state === "started");
    if (anyRunning.length > 0) return "running";
    const anyStopped = anyWorkers.filter(
      (m) => m.state === "stopped" || m.state === "created" || m.state === "suspended",
    );
    if (anyStopped.length === 0) return "no_machine";
    const started = await Promise.all(anyStopped.map((m) => startMachine(m.id)));
    if (!started.some(Boolean)) return "start_failed";
    await new Promise((r) => setTimeout(r, 4000));
    return "started";
  }

  const started = await Promise.all(stopped.map((m) => startMachine(m.id)));
  if (!started.some(Boolean)) return "start_failed";
  await new Promise((r) => setTimeout(r, 4000));
  return "started";
}

function isTransientNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  const code = e.code || e.cause?.code || "";
  const msg = String(e.message || "");
  return (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("fetch failed")
  );
}

async function transportFetch(
  url: URL,
  method: "GET" | "POST",
  secret: string,
  body?: unknown,
): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "X-Ascension-Publish-Token": secret,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
}

export async function callOwnerVolumeTransport<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  const endpoint = process.env["ASCENSION_VOLUME_TRANSPORT_URL"]?.trim();
  const secret = process.env["ASCENSION_PUBLISH_TOKEN"]?.trim();
  if (!endpoint || !secret) {
    throw new Error("Owner's private ASCENSION queue transport is not configured.");
  }
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Invalid private ASCENSION transport path.");
  }

  const usingFly = endpointRequiresFlyWake(endpoint);
  const wake = usingFly ? await ensureWorkerAwake() : "running";
  if (wake === "no_token") {
    // Do not invent credentials. If the worker is already running, transport
    // may still succeed below; only fail hard when the connect also fails.
  } else if (wake === "no_machine") {
    throw new Error(
      "No original ASCENSION worker machine with volume was found (fly_process_group=worker). Do not create a replacement web-image worker.",
    );
  } else if (wake === "start_failed") {
    throw new Error("Existing ASCENSION worker machine could not be started.");
  }

  const url = new URL(path, endpoint.endsWith("/") ? endpoint : endpoint + "/");

  let response: Response;
  try {
    response = await transportFetch(url, method, secret, body);
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err;
    const retryWake = usingFly ? await ensureWorkerAwake() : "running";
    if (retryWake === "no_token") {
      throw new Error(
        "ASCENSION worker is not reachable and no ASCENSION_FLY_MACHINE_TOKEN (or FLY_API_TOKEN) is available on the app to start the existing worker machine.",
      );
    }
    await new Promise((r) => setTimeout(r, 3000));
    try {
      response = await transportFetch(url, method, secret, body);
    } catch (err2) {
      if (isTransientNetworkError(err2)) {
        throw new Error(
          usingFly
            ? "ASCENSION worker did not become reachable after start attempt (ENOTFOUND/ECONNREFUSED). Original worker/volume must stay; do not replace the private image."
            : "ASCENSION local/hybrid governed transport is unreachable. Start the existing local transport and verify the private connection.",
        );
      }
      throw err2;
    }
  }

  const responseText = await response.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error("Owner's private ASCENSION worker returned a non-JSON response.");
  }

  if (!response.ok) {
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      if (usingFly) await ensureWorkerAwake();
      await new Promise((r) => setTimeout(r, 2500));
      const retry = await transportFetch(url, method, secret, body);
      const retryText = await retry.text();
      let retryPayload: Record<string, unknown>;
      try {
        retryPayload = JSON.parse(retryText) as Record<string, unknown>;
      } catch {
        throw new Error("Owner's private ASCENSION worker returned a non-JSON response.");
      }
      if (!retry.ok) {
        const message =
          typeof retryPayload["error"] === "string"
            ? retryPayload["error"]
            : "Private owner transport failed.";
        throw new Error(message.slice(0, 300));
      }
      return retryPayload as T;
    }
    const message =
      typeof payload["error"] === "string" ? payload["error"] : "Private owner transport failed.";
    throw new Error(message.slice(0, 300));
  }
  return payload as T;
}
