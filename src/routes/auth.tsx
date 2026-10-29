import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/** Only same-origin relative paths may be used as a post-sign-in destination. */
function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/live";
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({ next: safeNext(search["next"]) }),
  head: () => ({
    meta: [
      { title: "Sign in · ASCENSION governed observation access" },
      {
        name: "description",
        content:
          "Sign in to observe the live governed ASCENSION publication: Destiny, engines, Knowledgeverse, DTF pathways, governance and the Verified Δ ledger.",
      },
      { property: "og:title", content: "Sign in · ASCENSION governed observation access" },
      {
        property: "og:description",
        content: "Authorized, read-only access to the live governed ASCENSION publication.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: next });
    });
  }, [navigate, next]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}${next}` },
      });
      setBusy(false);
      if (signUpError) return setError(signUpError.message);
      setNotice("Account created. If confirmation is required, check your email, then sign in.");
      setMode("signin");
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) return setError(signInError.message);
    void navigate({ to: next });
  }

  async function google() {
    setBusy(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) {
      setBusy(false);
      setError(oauthError.message ?? "Google sign-in failed.");
      return;
    }
  }

  return (
    <section className="mx-auto max-w-lg">
      <p className="label-eyebrow">Authorized observation</p>
      <h1 className="text-etched mt-1 font-display text-xl text-gold uppercase sm:text-2xl">
        Sign in to the governed publication
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        The public surfaces show demo state. Signed-in access reads the mirrored LIVE_GOVERNED
        publication and your own saved observations. Read-only, always.
      </p>

      <div className="glass-inset mt-6 rounded-md px-4 py-5 sm:px-6">
        <div className="flex gap-2">
          {(["signin", "signup"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setError(null);
              }}
              aria-pressed={mode === value}
              className={
                mode === value
                  ? "min-h-9 rounded-sm border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[0.66rem] tracking-[0.2em] text-primary uppercase"
                  : "min-h-9 rounded-sm border border-border px-3 py-1.5 font-mono text-[0.66rem] tracking-[0.2em] text-muted-foreground uppercase hover:text-foreground"
              }
            >
              {value === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-void/60 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary/60"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-void/60 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary/60"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && <p className="text-sm text-primary">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="min-h-10 w-full rounded-sm border border-gold/60 bg-gold/15 px-4 py-2 font-mono text-[0.7rem] tracking-[0.22em] text-gold uppercase transition-colors hover:bg-gold/25 disabled:opacity-50"
          >
            {busy ? "Working…" : mode === "signin" ? "Enter" : "Create account"}
          </button>
        </form>

        <div className="gold-rule my-5 h-px opacity-50" />

        <button
          type="button"
          onClick={() => void google()}
          disabled={busy}
          className="min-h-10 w-full rounded-sm border border-border px-4 py-2 font-mono text-[0.7rem] tracking-[0.22em] text-muted-foreground uppercase transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
        >
          Continue with Google
        </button>
      </div>
    </section>
  );
}
