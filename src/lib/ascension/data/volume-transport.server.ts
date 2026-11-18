/**
 * Private ASCENSION queue bridge to the owner's existing Fly worker volume.
 * This is transport only. Authored ASCENSION_CORE decides every governed result.
 * The bridge never creates a database or reinterprets Knowledgeverse state.
 */
export function ownerVolumeTransportEnabled(): boolean {
  return Boolean(process.env["ASCENSION_VOLUME_TRANSPORT_URL"]?.trim());
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
  const url = new URL(path, endpoint.endsWith("/") ? endpoint : endpoint + "/");
  const response = await fetch(url, {
    method,
    headers: {
      "Accept": "application/json",
      "X-Ascension-Publish-Token": secret,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const responseText = await response.text();
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(responseText) as Record<string, unknown>; }
  catch { throw new Error("Owner's private ASCENSION worker returned a non-JSON response."); }
  if (!response.ok) {
    const message = typeof payload["error"] === "string" ? payload["error"] : "Private owner transport failed.";
    throw new Error(message.slice(0, 300));
  }
  return payload as T;
}
