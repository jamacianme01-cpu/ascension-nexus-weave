import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  listMyObjectives,
  submitObjective,
  type ObjectiveRun,
} from "@/lib/ascension/objectives.functions";

export const Route = createFileRoute("/_authenticated/objectives")({
  head: () => ({
    meta: [
      { title: "Objective intake · ASCENSION" },
      {
        name: "description",
        content:
          "Submit an objective with evidence and constraints to the governed ASCENSION runtime queue and follow stage, Guardian verdict, accepted Δ and persisted result.",
      },
      { property: "og:title", content: "Objective intake · ASCENSION" },
      {
        property: "og:description",
        content:
          "Authenticated objective submission and run status against the governed ASCENSION runtime.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ObjectivesPage,
});

const TERMINAL = new Set(["verified", "rejected", "failed"]);

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[0.6rem] tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="truncate font-mono text-xs text-foreground/90">
        {value === null || value === "" ? (
          <span className="text-muted-foreground">unavailable · {label}</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function RunCard({ run }: { run: ObjectiveRun }) {
  const [open, setOpen] = useState(false);
  const terminal = TERMINAL.has(run.status);
  return (
    <li className="rounded-lg border border-primary/20 bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-foreground">{run.objective}</p>
        <span
          className={`font-mono text-[0.6rem] tracking-[0.2em] uppercase ${
            run.status === "verified"
              ? "text-primary"
              : terminal
                ? "text-destructive"
                : "text-accent-foreground"
          }`}
        >
          {run.status}
        </span>
      </div>
      <a href={`/?run=${encodeURIComponent(run.id)}`} className="mt-3 inline-block text-sm text-primary underline">Open result</a>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="request id" value={run.id} />
        <Field label="stage" value={run.stage} />
        <Field label="guardian" value={run.guardian_verdict} />
        <Field label="outcome" value={run.outcome_status} />
        <Field label="runtime revision" value={run.runtime_revision} />
        <Field label="transition" value={run.transition_id} />
        <Field label="claimed by" value={run.claimed_by} />
        <Field label="completed at" value={run.completed_at} />
      </div>
      <button
        type="button"
        onClick={() => setOpen((prior) => !prior)}
        className="mt-3 font-mono text-[0.6rem] tracking-[0.2em] text-primary uppercase"
      >
        {open ? "hide" : "inspect"} evidence · Δ · persisted result
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          {(
            [
              ["evidence submitted", run.evidence],
              ["constraints submitted", run.constraints],
              ["accepted Δ (runtime)", run.accepted_delta],
              ["persisted result (runtime)", run.result],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <div className="font-mono text-[0.6rem] tracking-[0.2em] text-muted-foreground uppercase">
                {label}
              </div>
              {value === null ? (
                <div className="font-mono text-xs text-muted-foreground">
                  unavailable · {label}
                </div>
              ) : (
                <pre className="mt-1 overflow-x-auto rounded border border-primary/15 bg-background/60 p-2 font-mono text-[0.68rem] text-foreground/80">
                  {JSON.stringify(value, null, 2)}
                </pre>
              )}
            </div>
          ))}
          {run.error ? (
            <p className="font-mono text-xs text-destructive">{run.error}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ObjectivesPage() {
  const queryClient = useQueryClient();
  const [objective, setObjective] = useState("");
  const [evidence, setEvidence] = useState("");
  const [constraints, setConstraints] = useState("");
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);

  const runs = useQuery({
    queryKey: ["ascension", "my-objectives"],
    queryFn: () => listMyObjectives(),
    // The governed runtime writes status out-of-band; poll so the interface
    // shows only what it has actually published.
    refetchInterval: 5000,
  });

  const submit = useMutation({
    mutationFn: (input: { objective: string; evidence?: string[]; constraints?: string[] }) =>
      submitObjective({ data: input }),
    onSuccess: (result) => {
      setLastRequestId(result.request.id);
      setObjective("");
      setEvidence("");
      setConstraints("");
      void queryClient.invalidateQueries({ queryKey: ["ascension", "my-objectives"] });
    },
  });

  const items = runs.data?.items ?? [];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold tracking-wide text-foreground">
          Objective intake · governed execution
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Submitting records a signed submission in your queue. The governed ASCENSION runtime
          claims it, runs its own cycle — Meaning Element decomposition, DTF branches, evaluation,
          Guardian, selection, execution, AutoSync verification, Δ, persistence — and reports back.
          Nothing on this page executes, evaluates or verifies anything; every runtime field below
          is shown exactly as the runtime published it, or as unavailable.
        </p>
      </section>

      <section className="rounded-lg border border-primary/20 bg-background/40 p-4">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!objective.trim()) return;
            submit.mutate({
              objective,
              evidence: toLines(evidence),
              constraints: toLines(constraints),
            });
          }}
        >
          <label className="block">
            <span className="font-mono text-[0.6rem] tracking-[0.2em] text-primary uppercase">
              OBJECTIVE
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-foreground/90">
              What do you want ASCENSION to accomplish?
            </span>
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              rows={3}
              required
              aria-label="What do you want ASCENSION to accomplish?"
              className="mt-3 w-full rounded border border-primary/25 bg-background/70 p-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[0.6rem] tracking-[0.2em] text-primary uppercase">
                SOURCE EVIDENCE
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-foreground/90">
                What evidence, facts, observations, files, or context should ASCENSION use? Put one item per line.
              </span>
              <textarea
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
                rows={4}
                aria-label="What evidence, facts, observations, files, or context should ASCENSION use?"
                className="mt-3 w-full rounded border border-primary/25 bg-background/70 p-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[0.6rem] tracking-[0.2em] text-primary uppercase">
                CONSTRAINTS
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-foreground/90">
                What limits, requirements, boundaries, or conditions must ASCENSION preserve? Put one item per line.
              </span>
              <textarea
                value={constraints}
                onChange={(event) => setConstraints(event.target.value)}
                rows={4}
                aria-label="What limits, requirements, boundaries, or conditions must ASCENSION preserve?"
                className="mt-3 w-full rounded border border-primary/25 bg-background/70 p-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submit.isPending}
              className="rounded border border-primary/50 bg-primary/15 px-4 py-2 font-mono text-[0.68rem] tracking-[0.2em] text-primary uppercase disabled:opacity-50"
            >
              {submit.isPending ? "submitting…" : "submit objective"}
            </button>
            {lastRequestId ? (
              <span className="font-mono text-[0.62rem] tracking-[0.16em] text-muted-foreground">
                request_id · {lastRequestId}
              </span>
            ) : null}
          </div>
          {submit.isError ? (
            <p className="font-mono text-xs text-destructive">
              {(submit.error as Error).message}
            </p>
          ) : null}
        </form>
      </section>

      <section>
        <h2 className="font-mono text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
          your submissions · runtime-reported state
        </h2>
        {runs.isError ? (
          <p className="mt-3 font-mono text-xs text-destructive">
            {(runs.error as Error).message}
          </p>
        ) : items.length === 0 ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            unavailable · no submissions yet
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {items.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

