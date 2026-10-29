/** Compatibility shim — no third-party editor SDK. Prefer supabase.auth directly. */
import { supabase } from "../supabase/client";

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "github" | "apple",
      opts?: { redirect_uri?: string },
    ) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: opts?.redirect_uri },
      });
      if (error) return { error };
      return { redirected: Boolean(data?.url), data };
    },
  },
};
