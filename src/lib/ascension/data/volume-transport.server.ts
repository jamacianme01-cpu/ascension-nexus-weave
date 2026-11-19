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
  private_ip?: string;
  instance_id?: string;
};

function hasFlyToken(): boolean {
  return Boolean(process.env["FLY_API_TOKEN"]?.trim());
}

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

async function ensureWorkerAwake(): Promise<"running" | "started" | "no_machine" | "no_token"> {
  if (!hasFlyToken()) return "no_token";

  const machines = await flyMachines();
  const workers = machines.filter((m) => m.process_group === WORKER_PROCESS);
  const running = workers.filter((m) => m.state === "started");
  if (running.length > 0) return "running";

  const stopped = workers.filter((m) => m.state === "stopped" || m.state === "created" || m.state === "suspended");
  if (stopped.length === 0) return "no_machine";

  await Promise.all(stopped.map((m) => startMachine(m.id)));
  // Worker image + volume mount need time to bind :9091.
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
    throw new Error("Owner's private ASCENSION queue transport is not configured on Fly.");
  }
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Invalid private ASCENSION transport path.");
  }

  const wake = await ensureWorkerAwake();
  if (wake === "no_token") {
    throw new Error(
      "ASCENSION worker is stopped and FLY_API_TOKEN is not set on the Fly app, so ENGAGE cannot wake it. Set FLY_API_TOKEN as a Fly secret on ascension-nexus-weave.",
    );
  }
  if (wake === "no_machine") {
    throw new Error(
      "No ASCENSION worker machine exists on Fly. Create the worker process group once (fly scale count worker=1 --app ascension-nexus-weave), then ENGAGE can wake it.",
    );
  }

  const url = new URL(path, endpoint.endsWith("/") ? endpoint : endpoint + "/");

  let response: Response;
  try {
    response = await transportFetch(url, method, secret, body);
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err;
    // DNS/connect race: machine started but internal name not ready yet.
    await ensureWorkerAwake();
    await new Promise((r) => setTimeout(r, 3000));
    try {
      response = await transportFetch(url, method, secret, body);
    } catch (err2) {
      if (isTransientNetworkError(err2)) {
        throw new Error(
          "ASCENSION worker did not become reachable after wake (ENOTFOUND/ECONNREFUSED). Confirm the worker process is healthy on Fly.",
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
      await ensureWorkerAwake();
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
          typeof retryPayload["error"] === "string" ? retryPayload["error"] : "Private owner transport failed.";
        throw new Error(message.slice(0, 300));
      }
      return retryPayload as T;
    }
    const message = typeof payload["error"] === "string" ? payload["error"] : "Private owner transport failed.";
    throw new Error(message.slice(0, 300));
  }
  return payload as T;
}
