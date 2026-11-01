/**
 * Browser auth entry kept so route modules still resolve after the Supabase
 * client was removed. Public ASCENSION does not require a signed-in session.
 */
export const supabase = {
  auth: {
    async getUser() {
      return { data: { user: null }, error: null };
    },
    async getSession(): Promise<{ data: { session: { access_token: string } | null }; error: null }> {
      return { data: { session: null }, error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signInWithPassword() {
      return {
        data: { user: null, session: null },
        error: { message: "Sign-in is not configured for this independent build." },
      };
    },
    async signUp() {
      return {
        data: { user: null, session: null },
        error: { message: "Sign-up is not configured for this independent build." },
      };
    },
    async signOut() {
      return { error: null };
    },
  },
  async rpc(_name: string, _args?: Record<string, unknown>) {
    return {
      data: null,
      error: { message: "ASCENSION database is not connected." },
    };
  },
};
