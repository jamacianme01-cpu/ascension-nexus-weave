/** Hosts the owner has barred. This list only adds a refusal; it does not remove other controls. */
const BLOCKED_SUFFIXES = ["lovable.dev", "lovable.app", "l5e.io"];
const BLOCKED_ADDRESSES = new Set(["185.158.133.1"]);

export function refuseBlockedOrigin(target: string): void {
  let host = target.trim().toLowerCase();
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    // A bare host is still checked.
  }
  const blocked = BLOCKED_ADDRESSES.has(host) ||
    BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (blocked) {
    throw new Error(`Blocked outbound connection to Lovable (${host}).`);
  }
}
