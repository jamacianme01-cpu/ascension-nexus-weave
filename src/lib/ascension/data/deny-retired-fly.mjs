/**
 * Explicit retirement boundary for old Fly persistence settings.
 * Never open a PostgreSQL connection to these hosts, even if an old
 * DATABASE_URL secret is still present. Does not rewrite or migrate data.
 */
export function assertNotRetiredFlyAddress(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (["fly.dev", "fly.io", "internal", "flycast"].some(suffix =>
    host === suffix || host.endsWith("." + suffix))) {
    throw new Error("ASCENSION retired Fly database is disconnected; choose an owner-approved existing database.");
  }
}
