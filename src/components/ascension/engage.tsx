import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  getObjectiveStatus,
  submitObjective,
  type ObjectiveRun,
} from "@/lib/ascension/objectives.functions";
import { cn } from "@/lib/utils";

/**
 * The ASCENSION engage flow — the product surface.
 *
 * What do you want to accomplish → ASCENSION works → the RESULT.
 * The engines, Guardian fields, branch data and revisions live behind the
 * optional reasoning/pathways/verification reveals and the Inspect area.
 * Every value shown below is read from the run's own recorded result;
 * nothing is invented here.
 */

type RunJson = Record<string, unknown> | null;

function asJson(value: unknown): RunJson {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RunJson)
    : null;
}

function runPlanning(run: ObjectiveRun): RunJson {
  return asJson(run.result)?.["objective_planning"] as RunJson | undefined ?? null;
}

function runBranches(run: ObjectiveRun): Record<string, unknown>[] {
  const planning = runPlanning(run);
  const branches = planning?.["branches"];
  return Array.isArray(branches) ? (branches as Record<string, unknown>[]) : [];
}

function branchLabel(branch: Record<string, unknown>, index: number): string {
  const pathway =
    (typeof branch["pathway"] === "string" && branch["pathway"]) ||
    (typeof branch["action"] === "string" && branch["action"]) ||
    (typeof branch["name"] === "string" && branch["name"]) ||
    null;
  const id = typeof branch["id"] === "string" ? branch["id"] : `future-${index + 1}`;
  return pathway ? String(pathway) : id;
}

function selectedBranch(run: ObjectiveRun): { label: string; why?: string } | null {
  const planning = runPlanning(run);
  const selected = planning?.["selected_branch"];
  if (!selected) return null;
  if (typeof selected === "string") return { label: selected };
  const obj = asJson(selected);
  if (obj) {
    const why =
      (typeof obj["why_selected"] === "string" && obj["why_selected"]) ||
      (typeof obj["rationale"] === "string" && obj["rationale"]) ||
      undefined;
    const id =
      (typeof obj["branch_id"] === "string" && obj["branch_id"]) ||
      (typeof obj["id"] === "string" && obj["id"]) ||
      undefined;
    const pathways = runBranches(run);
    const match = id ? pathways.find((b) => b["id"] === id) : undefined;
    const label =
      (match ? branchLabel(match, 0) : null) ??
      (typeof obj["pathway"] === "string" ? String(obj["pathway"]) : null) ??
      id ??
      "selected future";
    return { label, why };
  }
  return null;
}

function deltaTotals(run: ObjectiveRun): { K: number; U: number; W: number } | null {
  const result = asJson(run.result);
  const fromResult =
    typeof result?.["delta_k"] === "number" ||
    typeof result?.["delta_w"] === "number" ||
    typeof result?.["delta_u"] === "number";
  if (fromResult) {
    return {
      K: Number(result?.["delta_k"] ?? 0),
      U: Number(result?.["delta_u"] ?? 0),
      W: Number(result?.["delta_w"] ?? 0),
    };
  }
  const accepted = asJson(run.accepted_delta);
  if (accepted) {
    return {
      K: Number(accepted["K"] ?? 0),
      U: Number(accepted["U"] ?? 0),
      W: Number(accepted["W"] ?? 0),
    };
  }
  return null;
}

function guardianPassed(run: ObjectiveRun): boolean {
  return run.guardian_verdict?.toLowerCase() === "pass";
}

/** Plain-language statement of what the run actually produced. */
function resultStatement(run: ObjectiveRun): { headline: string; detail: string } | null {
  const result = asJson(run.result);
  if (!result) return null;
  const chosen = selectedBranch(run);
  const delta = deltaTotals(run);
  const publication = asJson(result["publication"]);
  const receipts = result["execution_receipts"];

  const deltaText = delta
    ? `Verified Δ — knowledge +${delta.K}, understanding +${delta.U}, wisdom +${delta.W}.`
    : "";
  const revisionText =
    typeof result["runtime_revision"] === "number"
      ? ` Persisted in the Knowledgeverse at revision ${result["runtime_revision"]}.`
      : publication && typeof publication["publication_revision"] === "number"
        ? ` Persisted in the Knowledgeverse at revision ${publication["publication_revision"]}.`
        : "";

  const headline = chosen
    ? chosen.label
    : "Objective verified and persisted into the Knowledgeverse.";

  let receiptText = "";
  if (Array.isArray(receipts) && receipts.length > 0) {
    const lines = receipts
      .map((receipt) => {
        const r = asJson(receipt);
        const action =
          (typeof r?.["action"] === "string" && r["action"]) ||
          (typeof r?.["step"] === "string" && r["step"]) ||
          null;
        return action ? String(action) : null;
      })
      .filter((x): x is string => Boolean(x))
      .slice(0, 4);
    if (lines.length) receiptText = ` Performed: ${lines.join("; ")}.`;
  }

  const whyText = chosen?.why ? ` Selected because ${chosen.why}.` : "";
  return {
    headline,
    detail: `${deltaText}${revisionText}${whyText}${receiptText}`.trim(),
  };
}

const TERMINAL = new Set(["verified", "rejected", "failed"]);

function statusLine(run: ObjectiveRun | null): string {
  if (!run) return "";
  if (run.status === "verified") return "Complete";
  if (run.status === "rejected") return "Rejected by governance";
  if (run.status === "failed") return "Run failed";
  if (run.status === "queued") return "Engaged · waiting for the runtime";
  const stage = run.stage?.replace(/_/g, " ") ?? "working";
  return `ASCENSION is working · ${stage}`;
}

function Disclosure({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-sm border border-border/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <span className="font-mono text-[0.66rem] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:text-foreground">
          {label}
        </span>
        <span
          className={cn(
            "font-mono text-[0.9rem] text-primary transition-transform duration-200",
            open && "rotate-90",
          )}
          aria-hidden
        >
          ›
        </span>
      </button>
      {open && (
        <div className="border-t border-border/60 px-4 py-4 text-sm leading-relaxed text-foreground/85">
          {children}
        </div>
      )}
    </div>
  );
}

function ResultPanel({ run }: { run: ObjectiveRun }) {
  const statement = resultStatement(run);
  const delta = deltaTotals(run);
  const futures = runBranches(run);
  const chosen = selectedBranch(run);
  const result = asJson(run.result);
  const verified = run.status === "verified";

  return (
    <section
      aria-label="Result"
      className="glass-inset relative overflow-hidden rounded-md border border-primary/25 px-5 py-6 sm:px-8 sm:py-8"
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <p className="font-mono text-[0.62rem] tracking-[0.3em] text-primary uppercase">
        Result
      </p>

      {verified ? (
        <>
          <p className="mt-3 max-w-2xl text-lg leading-snug font-medium text-foreground sm:text-xl">
            {statement?.headline ?? "Objective verified and persisted."}
          </p>
          {statement?.detail && (
            <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-muted-foreground">
              {statement.detail}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[0.64rem] tracking-[0.14em] uppercase">
            <span className="rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-primary">
              ASCENSION · Verified / Persisted
            </span>
            {guardianPassed(run) && (
              <span className="rounded-sm border border-border px-2 py-1 text-muted-foreground">
                Guardian · pass
              </span>
            )}
            {delta && (
              <span className="rounded-sm border border-gold/40 bg-gold/10 px-2 py-1 text-gold">
                Δ K+{delta.K} · U+{delta.U} · W+{delta.W}
              </span>
            )}
          </div>
        </>
      ) : run.status === "rejected" ? (
        <>
          <p className="mt-3 max-w-2xl text-lg font-medium text-foreground">
            ASCENSION's governance did not allow this objective to proceed.
          </p>
          <p className="mt-2 max-w-2xl text-[0.92rem] text-muted-foreground">
            {run.error ?? "Guardian review blocked the pathways available for this objective."}
          </p>
        </>
      ) : run.status === "failed" ? (
        <>
          <p className="mt-3 max-w-2xl text-lg font-medium text-foreground">
            This run failed.
          </p>
          <p className="mt-2 max-w-2xl text-[0.92rem] text-muted-foreground">
            {run.error ?? "The runtime reported a failure. Nothing was persisted."}
          </p>
        </>
      ) : (
        <div className="mt-4 flex items-center gap-3" aria-live="polite">
          <span className="alive size-2.5 rounded-full bg-primary photon-glow" />
          <p className="font-mono text-[0.78rem] tracking-[0.14em] text-muted-foreground uppercase">
            {statusLine(run)}
          </p>
        </div>
      )}

      {verified && (
        <div className="mt-6 grid gap-2">
          <p className="font-mono text-[0.6rem] tracking-[0.24em] text-muted-foreground/70 uppercase">
            Optional
          </p>
          <Disclosure label="View reasoning">
            <p className="text-[0.92rem] text-foreground/85">
              {chosen
                ? `From your objective, ASCENSION formed meaning, compared ${futures.length || "several"} possible futures, and moved down: “${chosen.label}”.${chosen.why ? ` ${chosen.why}` : ""}`
                : "ASCENSION decomposed your objective into meaning elements, compared possible futures, and executed the pathway governance allowed."}
            </p>
            {Array.isArray(result?.["meaning_elements"]) ||
            (runPlanning(run)?.["meaning_elements"] as unknown[] | undefined) ? (
              <p className="mt-2 text-[0.85rem] text-muted-foreground">
                The meaning ASCENSION found in your words now lives in the Knowledgeverse —
                visible on the{" "}
                <a href="/knowledgeverse" className="text-primary underline underline-offset-4">
                  Knowledgeverse page
                </a>
                .
              </p>
            ) : null}
          </Disclosure>
          <Disclosure label="View pathways">
            {futures.length > 0 ? (
              <ul className="space-y-2">
                {futures.map((branch, index) => {
                  const label = branchLabel(branch, index);
                  const isChosen =
                    chosen !== null && label === chosen.label;
                  return (
                    <li
                      key={index}
                      className={cn(
                        "rounded-sm border px-3 py-2 text-[0.9rem]",
                        isChosen
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border/70 text-muted-foreground",
                      )}
                    >
                      {isChosen && (
                        <span className="mr-2 font-mono text-[0.6rem] tracking-[0.2em] text-primary uppercase">
                          chosen ·
                        </span>
                      )}
                      {label}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                The compared futures for this run were not published to your view.
              </p>
            )}
          </Disclosure>
          <Disclosure label="View verification">
            <p className="text-[0.92rem] text-foreground/85">
              Guardian {guardianPassed(run) ? "passed" : (run.guardian_verdict ?? "unavailable")} ·
              AutoSync verified the outcome against submitted evidence · the accepted Δ is
              recorded in the persisted ledger
              {typeof result?.["runtime_revision"] === "number"
                ? ` (revision ${result["runtime_revision"]})`
                : ""}
              .
            </p>
          </Disclosure>
        </div>
      )}
    </section>
  );
}

export function Engage() {
  const queryClient = useQueryClient();
  const [objective, setObjective] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [authRedirect, setAuthRedirect] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const draftKey = "ascension.objective.draft";

  useEffect(() => {
    const draft = sessionStorage.getItem(draftKey);
    if (draft) {
      setObjective(draft);
      sessionStorage.removeItem(draftKey);
    }
  }, []);

  const { data: run } = useQuery({
    queryKey: ["ascension", "run", activeRunId],
    enabled: Boolean(activeRunId),
    queryFn: async () => {
      if (!activeRunId) return null;
      const { request } = await getObjectiveStatus({ data: { requestId: activeRunId } });
      return request;
    },
    refetchInterval: (query) => {
      const current = query.state.data;
      return current && TERMINAL.has(current.status) ? false : 3000;
    },
  });

  const engage = useMutation({
    mutationFn: async (text: string) => {
      const { request } = await submitObjective({
        data: { objective: text },
      });
      return request;
    },
    onSuccess: (request) => {
      setObjective("");
      setActiveRunId(request.id);
      queryClient.invalidateQueries({ queryKey: ["ascension", "my-objectives"] });
    },
    onError: async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/auth|session|jwt|unauthorized/i.test(message)) {
        sessionStorage.setItem(draftKey, objective);
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          setAuthRedirect(true);
          window.location.href = `/auth?next=${encodeURIComponent("/")}`;
          return;
        }
      }
    },
  });

  const followUp = useCallback(
    (kind: "continue" | "refine" | "execute") => {
      const base = run?.objective ?? objective;
      if (!base) return;
      const prefix =
        kind === "continue"
          ? "Continue: "
          : kind === "refine"
            ? ""
            : "Execute the selected pathway for: ";
      setObjective(kind === "refine" ? base : `${prefix}${base}`);
      inputRef.current?.focus();
    },
    [run, objective],
  );

  const busy = engage.isPending;
  const working = run !== undefined && run !== null && !TERMINAL.has(run.status);
  const shown = run ?? null;
  const canEngage = objective.trim().length > 0 && !busy && !working && !authRedirect;

  const placeholder = useMemo(
    () => "What do you want to accomplish?",
    [],
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <section aria-label="Engage ASCENSION" className="space-y-4">
        <h1 className="text-etched font-display text-2xl tracking-[0.34em] text-foreground uppercase sm:text-3xl">
          Ascension
        </h1>
        <label
          htmlFor="objective"
          className="block text-[1.05rem] leading-relaxed text-foreground/90"
        >
          {placeholder}
        </label>
        <textarea
          id="objective"
          ref={inputRef}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canEngage) {
              engage.mutate(objective.trim());
            }
          }}
          rows={4}
          maxLength={4000}
          disabled={busy || working}
          placeholder="Say it in your own words — ASCENSION will work it."
          className="w-full resize-y rounded-md border border-border bg-void/60 px-4 py-3.5 text-[1rem] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-[0.6rem] tracking-[0.2em] text-muted-foreground/70 uppercase">
            {working ? statusLine(shown) : "Ctrl + Enter"}
          </p>
          <button
            type="button"
            disabled={!canEngage}
            onClick={() => engage.mutate(objective.trim())}
            className={cn(
              "min-h-12 rounded-md border px-6 py-3 font-display text-[0.8rem] tracking-[0.26em] uppercase transition-all",
              canEngage
                ? "border-primary/60 bg-primary/15 text-primary photon-glow hover:bg-primary/25"
                : "border-border text-muted-foreground/50",
            )}
          >
            {busy ? "Engaging…" : "Engage Ascension"}
          </button>
        </div>
      </section>

      {shown && <ResultPanel run={shown} />}

      {shown?.status === "verified" && (
        <section aria-label="Continue with this result" className="flex flex-wrap gap-2">
          {(
            [
              ["continue", "Continue"],
              ["refine", "Refine"],
              ["execute", "Execute"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() => followUp(kind)}
              className="min-h-10 rounded-sm border border-border px-4 py-2 font-mono text-[0.66rem] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:border-gold/50 hover:text-gold"
            >
              {label}
            </button>
          ))}
          <a
            href="/objectives"
            className="min-h-10 rounded-sm border border-border px-4 py-2 font-mono text-[0.66rem] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:border-primary/40 hover:text-primary"
          >
            Past runs
          </a>
        </section>
      )}
    </div>
  );
}
