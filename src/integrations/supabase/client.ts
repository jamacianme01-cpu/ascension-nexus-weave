/**
 * Browser import retained by older authenticated routes.
 * Public ASCENSION does not call Supabase. Any use fails instead of inventing a session.
 */
function unavailable(): never {
  throw new Error("Supabase is not connected. Public ASCENSION does not use it.");
}

export const supabase = new Proxy(
  {},
  {
    get() {
      return new Proxy(unavailable, { get: () => unavailable, apply: () => unavailable() });
    },
  },
);
