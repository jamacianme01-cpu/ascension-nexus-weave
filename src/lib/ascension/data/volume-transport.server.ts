/**
 * ASCENSION governed transport on the owner's computer / private Oracle hybrid.
 * Transport does not generate results, publish verification, or control engines.
 * The original ASCENSION_CORE, Guardian, CLARITY and Knowledgeverse stay authoritative.
 * No Fly Machines API, platform startup, replacement worker, or external AI.
 */

function isRetiredFlyHost(host: string): boolean {
  return host.endsWith(".fly.dev") || host.endsWith(".fly.io") ||
    host.endsWith(".internal");
}

export function ownerVolumeTransportEnabled(): boolean {
  const endpoint = process.env["ASCENSION_VOLUME_TRANSPORT_URL"]?.trim();
  if (!endpoint) return false;
  // A stale Fly URL must never win over the existing database transport.
  // OTHER invalid URLs still select this transport and fail validation:
  // do not silently switch persistence on a configuration mistake.
  try {
    return !isRetiredFlyHost(new URL(endpoint).hostname.toLowerCase());
  } catch {
    return true;
  }
}

/** Credentials are never sent to a remote plaintext address. */
function validatedOwnerEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("ASCENSION transport URL must not contain credentials, queries, or fragments.");
  }
  const hostname = url.hostname.toLowerCase();
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  const remoteTls = url.protocol === "https:";
  const localPlaintext = url.protocol === "http:" && loopback;
  if (!remoteTls && !localPlaintext) {
    throw new Error("ASCENSION hybrid transport must use HTTPS, or HTTP on local loopback.");
  }
  if (isRetiredFlyHost(hostname)) {
    throw new Error("ASCENSION owner hybrid cannot connect to the retired Fly endpoint.");
  }
  return url;
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

  // Validate before a single authenticated request leaves the server.
  validatedOwnerEndpoint(endpoint);

  const url = new URL(path, endpoint.endsWith("/") ? endpoint : endpoint + "/");

  let response: Response;
  try {
    response = await transportFetch(url, method, secret, body);
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err;
    await new Promise((r) => setTimeout(r, 3000));
    try {
      response = await transportFetch(url, method, secret, body);
    } catch (err2) {
      if (isTransientNetworkError(err2)) {
        throw new Error(
          "ASCENSION local/hybrid governed transport is unreachable. Verify the owner's existing runtime and secure connection.",
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
