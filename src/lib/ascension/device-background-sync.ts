/**
 * Optional desktop companion pairing for closed-browser encrypted folder exchange.
 * The owner must select a folder in the browser AND provide its local absolute
 * path to the loopback companion. A one-time marker proves both selections
 * identify the same directory; the marker contains no Library Card contents.
 * Neither passphrase nor card capability is stored in a config file or cloud.
 */
import { deviceCardId } from "./device-knowledgeverse";
import {
  getOrCreateSyncDeviceId, type DeviceSyncFolder,
} from "./device-folder-sync";

const ENDPOINT = "http://127.0.0.1:8788";
async function request(route: string, body: object): Promise<{ active: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(ENDPOINT + route, {
      method: "POST", mode: "cors", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal,
    });
    const result = await response.json() as { active: boolean; error?: string };
    if (!response.ok) throw new Error(result.error || "The desktop background companion rejected pairing.");
    return result;
  } finally { clearTimeout(timeout); }
}
export async function startDesktopBackgroundSync(
  folder: DeviceSyncFolder, passphrase: string, directory: string,
): Promise<void> {
  if (!directory.trim()) throw new Error("A private desktop folder path is required.");
  const token = crypto.randomUUID();
  const marker = ".ascension-bg-pair-" + token + ".tmp";
  const handle = await folder.getFileHandle(marker, { create: true });
  const writer = await handle.createWritable();
  try {
    await writer.write(new Blob([token], {type: "text/plain"}));
    await writer.close();
  } catch (cause) {
    if (writer.abort) { try { await writer.abort(); } catch { /* Keep original error. */ } }
    throw cause;
  }
  try {
    const result = await request("/v1/background-sync-start", {
      libraryKey: deviceCardId(), deviceId: getOrCreateSyncDeviceId(),
      directory: directory.trim(), passphrase, marker, token,
    });
    if (!result.active) throw new Error("The local desktop sync worker did not activate.");
  } finally {
    // The marker is only a same-directory ownership proof, not a credential.
    if (folder.removeEntry) { try { await folder.removeEntry(marker); } catch { /* Marker expires with folder cleanup. */ } }
  }
}
export async function stopDesktopBackgroundSync(): Promise<void> {
  const result = await request("/v1/background-sync-stop", {
    libraryKey: deviceCardId(),
  });
  if (result.active) throw new Error("The desktop background sync remains active.");
}
