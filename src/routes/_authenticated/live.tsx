import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  deleteObservation,
  getGovernedPublication,
  listMyObservations,
  saveObservation,
} from "@/lib/ascension/publications.functions";

export const Route = createFileRoute("/_authenticated/live")({
  head: () => ({
    meta: [
      { title: "Live governed publication · ASCENSION" },
      {
        name: "description",
        content:
          "Authorized read-only view of the mirrored LIVE_GOVERNED ASCENSION publication with revision, snapshot and content hashes, plus your saved observations.",
      },
      { property: "og:title", content: "Live governed publication · ASCENSION" },
      {
        property: "og:description",
        content: "Authorized read-only view of the mirrored LIVE_GOVERNED ASCENSION publication.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LivePage,
});

function Unavailable({ what }: { what: string }) {
  return (
    <span className="font-mono text-[0.68rem] tracking-[0.18em] text-muted-foreground uppercase">
      unavailable · {what}
    </span>
  );
}

function LivePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const publication = useQuery({
    queryKey: ["ascension", "governed-publication"],
    queryFn: () => getGovernedPublication(),
  });
  const observations = useQuery({
    queryKey: ["ascension", "my-observations"],
    queryFn: () => listMyObservations(),
  });

  const create = useMutation({
    mutationFn: (input: { label: string; note?: string; revision?: number }) =>
      saveObservation({ data: input }),
    onSuccess: () => {
      setLabel("");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["ascension", "my-observations"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteObservation({ data: { id } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["ascension", "my-observations"] }),
  });

  const surfaces = publication.data?.surfaces ?? [];
  const revision = publication.data?.revision ?? null;
  const first = surfaces[0];

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-eyebrow">Authorized observation · read-only</p>
            <h1 className="text-etched mt-1 font-display text-xl text-gold uppercase sm:text-2xl">
              Live governed publication
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Everything below is the publication your gateway pushed, stored verbatim. Nothing here
              can write to or reinterpret the governed core.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              void navigate({ to: "/auth", search: { next: "/live" } });
            }}
            className="min-h-9 rounded-sm border border-border px-3 py-1.5 font-mono text-[0.66rem] tracking-[0.2em] text-muted-foreground uppercase hover:border-gold/50 hover:text-gold"
          >
            Sign out
          </button>
        </div>

        <dl className="glass-inset mt-5 grid gap-4 rounded-md px-4 py-4 sm:grid-cols-3 sm:px-6">
          <div>
            <dt className="label-eyebrow">Publication revision</dt>
            <dd className="mt-1 font-display text-lg text-primary">
              {revision ?? <Unavailable what="no publication pushed yet" />}
            </dd>
          </div>
          <div>
            <dt className="label-eyebrow">Source classification</dt>
            <dd className="mt-1 font-mono text-sm text-gold">
              {first?.source_classification ?? <Unavailable what="no publication pushed yet" />}
            </dd>
          </div>
          <div>
            <dt className="label-eyebrow">Snapshot hash</dt>
            <dd className="mt-1 font-mono text-[0.7rem] break-all text-muted-foreground">
              {first?.snapshot_hash ?? <Unavailable what="snapshot_hash not published" />}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <p className="label-eyebrow">Published surfaces</p>
        {publication.isLoading && (
          <p className="mt-3 font-mono text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
            Reading governed publication…
          </p>
        )}
        {publication.isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Governed publication unavailable: {(publication.error as Error).message}
          </p>
        )}
        {!publication.isLoading && !publication.isError && surfaces.length === 0 && (
          <div className="glass-inset mt-3 rounded-md px-4 py-5">
            <p className="font-display text-sm text-gold uppercase">
              LIVE ASCENSION STATE UNAVAILABLE
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              No governed publication has been pushed to this store yet. The gateway sends one by
              POSTing its verified publication to{" "}
              <code className="font-mono text-gold/80">/api/public/ascension/publish</code> with the
              publish token header. No demo state is substituted here.
            </p>
          </div>
        )}
        <div className="mt-3 space-y-3">
          {surfaces.map((surface) => (
            <details key={surface.surface} className="glass-inset rounded-md px-4 py-3">
              <summary className="cursor-pointer font-display text-sm tracking-wide text-primary">
                {surface.surface}
                <span className="ml-3 font-mono text-[0.65rem] tracking-[0.18em] text-muted-foreground uppercase">
                  rev {surface.revision} · {surface.source_classification}
                </span>
              </summary>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="label-eyebrow">Content hash</dt>
                  <dd className="font-mono text-[0.7rem] break-all text-muted-foreground">
                    {surface.content_hash ?? <Unavailable what="content_hash not published" />}
                  </dd>
                </div>
                <div>
                  <dt className="label-eyebrow">Published at</dt>
                  <dd className="font-mono text-[0.7rem] text-muted-foreground">
                    {surface.published_at ?? <Unavailable what="published_at not published" />}
                  </dd>
                </div>
              </dl>
              <pre className="mt-3 max-h-80 overflow-auto rounded-sm border border-border/60 bg-void/60 p-3 font-mono text-[0.68rem] text-muted-foreground">
                {JSON.stringify(surface.payload, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      </section>

      <section>
        <p className="label-eyebrow">Your observations</p>
        <h2 className="text-etched mt-1 font-display text-base text-gold uppercase">
          Private to your account
        </h2>
        <form
          className="glass-inset mt-4 space-y-3 rounded-md px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              label,
              ...(note.trim() ? { note } : {}),
              ...(revision !== null ? { revision } : {}),
            });
          }}
        >
          <div>
            <label
              htmlFor="obs-label"
              className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase"
            >
              Label
            </label>
            <input
              id="obs-label"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-void/60 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary/60"
            />
          </div>
          <div>
            <label
              htmlFor="obs-note"
              className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase"
            >
              Note
            </label>
            <textarea
              id="obs-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-void/60 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary/60"
            />
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-destructive">
              {(create.error as Error).message}
            </p>
          )}
          <button
            type="submit"
            disabled={create.isPending}
            className="min-h-9 rounded-sm border border-primary/40 bg-primary/10 px-4 py-1.5 font-mono text-[0.68rem] tracking-[0.2em] text-primary uppercase disabled:opacity-50"
          >
            {create.isPending ? "Saving…" : "Save observation"}
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {(observations.data?.items ?? []).map((item) => (
            <li
              key={item.id}
              className="glass-inset flex flex-wrap items-start justify-between gap-3 rounded-md px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-display text-sm text-primary">{item.label}</p>
                {item.note && (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.note}</p>
                )}
                <p className="mt-1 font-mono text-[0.65rem] tracking-[0.18em] text-gold/70 uppercase">
                  {item.revision !== null ? `rev ${item.revision}` : "revision unavailable"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(item.id)}
                className="min-h-9 rounded-sm border border-border px-3 py-1.5 font-mono text-[0.64rem] tracking-[0.2em] text-muted-foreground uppercase hover:border-destructive/50 hover:text-destructive"
              >
                Remove
              </button>
            </li>
          ))}
          {observations.data?.items.length === 0 && (
            <li className="font-mono text-[0.68rem] tracking-[0.18em] text-muted-foreground uppercase">
              No saved observations yet.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
