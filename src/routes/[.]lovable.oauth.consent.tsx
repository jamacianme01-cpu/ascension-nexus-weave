import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Authorization consent for AI clients (ChatGPT, Claude, Cursor, …) connecting
 * to the ASCENSION observation tools. Approving grants read-only tool access as
 * the signed-in account; it never grants write access to the governed core.
 */

type OAuthDetails = {
  client?: { name?: string; redirect_uri?: string } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id:
      typeof search["authorization_id"] === "string" ? search["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/auth",
        search: { next: location.pathname + location.searchStr },
      });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  errorComponent: ({ error }) => (
    <section className="mx-auto max-w-lg">
      <p className="label-eyebrow">Authorization</p>
      <h1 className="text-etched mt-1 font-display text-lg text-gold uppercase">
        Could not load this request
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {String((error as Error)?.message ?? error)}
      </p>
    </section>
  ),
  component: Consent,
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "an application";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: decideError } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect was returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <section className="mx-auto max-w-lg">
      <p className="label-eyebrow">Authorization · read-only</p>
      <h1 className="text-etched mt-1 font-display text-xl text-gold uppercase sm:text-2xl">
        Connect {clientName} to ASCENSION
      </h1>
      <div className="glass-inset mt-5 space-y-4 rounded-md px-4 py-5 sm:px-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {clientName} will be able to call the ASCENSION observation tools as you. Those tools only
          read published state — they cannot write to or reinterpret the governed core.
        </p>
        <dl className="space-y-2">
          <div>
            <dt className="label-eyebrow">Returns to</dt>
            <dd className="font-mono text-[0.7rem] break-all text-muted-foreground">
              {details?.client?.redirect_uri ?? "unavailable · redirect_uri not provided"}
            </dd>
          </div>
          <div>
            <dt className="label-eyebrow">Requested access</dt>
            <dd className="font-mono text-[0.7rem] break-all text-muted-foreground">
              {details?.scope ?? "Your basic profile and email address"}
            </dd>
          </div>
        </dl>
        <p className="font-mono text-[0.65rem] tracking-[0.18em] text-gold/70 uppercase">
          This does not bypass this app's permissions or backend policies.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide(true)}
            className="min-h-10 rounded-sm border border-gold/60 bg-gold/15 px-4 py-2 font-mono text-[0.7rem] tracking-[0.22em] text-gold uppercase hover:bg-gold/25 disabled:opacity-50"
          >
            {busy ? "Working…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide(false)}
            className="min-h-10 rounded-sm border border-border px-4 py-2 font-mono text-[0.7rem] tracking-[0.22em] text-muted-foreground uppercase hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
          >
            Cancel connection
          </button>
        </div>
      </div>
    </section>
  );
}
