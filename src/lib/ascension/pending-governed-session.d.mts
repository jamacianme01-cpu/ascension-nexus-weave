export type PendingGoverned = { crystalId: string; requestId: string; guestToken: string };
export type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function readPendingGoverned(storage: SessionStore, now?: number): PendingGoverned | null;
export function savePendingGoverned(storage: SessionStore, credentials: PendingGoverned, now?: number): boolean;
export function clearPendingGoverned(storage: SessionStore): void;
