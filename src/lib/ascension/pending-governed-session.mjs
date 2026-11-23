/** Resume only an original, explicitly authorized governed request in the same tab. */
const KEY = "ascension.pending-governed-request.v1";
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export function readPendingGoverned(storage, now = Date.now()) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const row = JSON.parse(raw);
    if (!row || typeof row !== "object" ||
        !UUID.test(row.crystalId) || !UUID.test(row.requestId) ||
        !UUID.test(row.guestToken) || !Number.isFinite(row.createdAt) ||
        row.createdAt > now || now - row.createdAt >= MAX_AGE) {
      storage.removeItem(KEY);
      return null;
    }
    return { crystalId: row.crystalId, requestId: row.requestId, guestToken: row.guestToken };
  } catch { return null; }
}
export function savePendingGoverned(storage, credentials, now = Date.now()) {
  if (![credentials.crystalId, credentials.requestId, credentials.guestToken].every(id => UUID.test(id)))
    throw new Error("Invalid governed authorization for session continuity.");
  try {
    storage.setItem(KEY, JSON.stringify({ ...credentials, createdAt: now }));
    return true;
  } catch { return false; }
}
export function clearPendingGoverned(storage) {
  try { storage.removeItem(KEY); } catch { /* Storage may be blocked. */ }
}
