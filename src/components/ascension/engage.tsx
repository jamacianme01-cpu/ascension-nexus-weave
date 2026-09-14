import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getObjectiveStatus,
  listMyObjectives,
  submitObjective,
  type ObjectiveRun,
} from "@/lib/ascension/objectives.functions";
import { getObjectiveDelivery, prepareObjectiveDelivery } from "@/lib/ascension/delivery.functions";
import {
  governedPersisted,
  planningFor,
  branchTitle,
  receiptFiles,
  record,
  strings,
  parseDelivery,
  type ObjectiveDelivery,
} from "@/lib/ascension/result-model";
import { ConnectedKnowledgeWorld } from "./knowledge-world";
import chamberPlate from "@/assets/chamber.png.asset.json";

const TERMINAL = new Set(["verified", "rejected", "failed"]);
const ACTIVE = "ascension.active-objective";
const DRAFT = "ascension.objective.draft";
type FollowUp = "continue" | "refine" | "simulate" | "execute";

function save(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* Storage can be disabled. */
  }
}
function read(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Reveal({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-border/70 px-4 py-3">
      <summary className="cursor-pointer text-sm text-muted-foreground">{label}</summary>
      <div className="mt-4 space-y-3 text-sm leading-relaxed">{children}</div>
    </details>
  );
}

export function ResultContent({ delivery }: { delivery: ObjectiveDelivery }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-medium text-foreground">{delivery.title}</h3>
      <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed text-foreground/90">
        {delivery.body}
      </p>
      {delivery.files.map((file) => (
        <div
          key={file.name}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4"
        >
          <span className="break-all text-sm text-primary">{file.name}</span>
          <button
            type="button"
            onClick={() => download(file.name, file.content)}
            className="min-h-11 rounded-full border border-primary/40 px-4 text-sm text-primary"
          >
            Download file
          </button>
        </div>
      ))}
      {delivery.limitations.length > 0 && (
        <div className="rounded-lg border border-gold/20 p-4">
          <p className="text-xs text-gold">What remains</p>
          <ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-muted-foreground">
            {delivery.limitations.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {delivery.kind === "artifact" ? "Created draft" : "Generated response"} · awaiting
        independent verification
      </p>
    </div>
  );
}

function RuntimeDetails({ run }: { run: ObjectiveRun }) {
  const p = planningFor(run.result),
    result = record(run.result);
  const persisted = governedPersisted(run);
  const files = receiptFiles(run.result);
  return (
    <div className="grid gap-2">
      <Reveal label="View reasoning">
        <p>
          {p.elements.length
            ? `${p.elements.length} Meaning Elements were recorded from this objective.`
            : "Reasoning has not been published for this run."}
        </p>
        {p.elements.map((m, i) => (
          <p key={i} className="text-muted-foreground">
            {String(m["text"] ?? m["me_id"] ?? "")}
          </p>
        ))}
      </Reveal>
      <Reveal label="View pathways">
        {p.branches.length ? (
          p.branches.map((b, i) => (
            <div key={String(b["branch_id"] ?? i)} className="rounded-lg border border-border p-3">
              <p className="text-primary">
                {branchTitle(b)}
                {b["branch_id"] === p.selected["branch_id"] && (
                  <span className="ml-2 text-xs text-gold">Selected</span>
                )}
              </p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {strings(b["actions"]).map((a, j) => (
                  <li key={j}>{a}</li>
                ))}
              </ul>
              {strings(b["risks"]).length > 0 && (
                <p className="mt-2 text-xs text-gold">{strings(b["risks"]).join(" · ")}</p>
              )}
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">
            Alternative futures have not been published for this run.
          </p>
        )}
      </Reveal>
      <Reveal label="View verification">
        <p>
          {persisted
            ? "The runtime verified its recorded artifacts and persisted the associated Δ."
            : "Governed persistence has not been confirmed for this run."}
        </p>
        <p className="text-muted-foreground">
          The generated answer above is external output. This runtime receipt does not verify that
          answer or establish that the whole objective was accomplished.
        </p>
        <p>
          Guardian: {run.guardian_verdict ?? "not published"} · AutoSync:{" "}
          {String(result["autosync_verdict"] ?? "not published")}
        </p>
        {persisted && (
          <p className="text-gold">
            Verified Δ · K {String(result["delta_k"] ?? "—")} · W {String(result["delta_w"] ?? "—")}{" "}
            · U {String(result["delta_u"] ?? "—")}
          </p>
        )}
        {files.map((file, i) => (
          <p key={i} className="break-all text-muted-foreground">
            Recorded artifact: {file.name}
            {file.bytes !== null ? ` (${file.bytes} bytes)` : ""}
          </p>
        ))}
      </Reveal>
    </div>
  );
}

function PathwayChoices({
  run,
  selectedId,
  onSelect,
  onAction,
}: {
  run: ObjectiveRun;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAction: (kind: FollowUp) => void;
}) {
  const pathways = planningFor(run.result);
  if (!pathways.branches.length) return null;
  const recommendedId = String(pathways.selected["branch_id"] ?? "");
  return (
    <section aria-label="Choose a pathway" className="space-y-4">
      <div>
        <p className="label-eyebrow text-primary">PATHWAYS</p>
        <p className="mt-2 text-sm text-muted-foreground">
          ASCENSION recommends the strongest supported pathway. You choose which valid pathway moves forward.
        </p>
      </div>
      <div className="grid gap-3">
        {pathways.branches.map((branch, index) => {
          const id = String(branch["branch_id"] ?? index);
          const selected = selectedId === id;
          const recommended = recommendedId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={selected}
              className={`rounded-xl border p-4 text-left transition ${
                selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              }`}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-foreground">{branchTitle(branch)}</span>
                {recommended && <span className="text-xs text-gold">RECOMMENDED</span>}
                {selected && <span className="text-xs text-primary">YOUR SELECTION</span>}
              </span>
              {strings(branch["actions"]).length > 0 && (
                <span className="mt-2 block text-sm text-muted-foreground">
                  {strings(branch["actions"]).join(" · ")}
                </span>
              )}
              {strings(branch["risks"]).length > 0 && (
                <span className="mt-2 block text-xs text-gold">
                  Risk/tradeoff: {strings(branch["risks"]).join(" · ")}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onAction("simulate")} disabled={!selectedId} className="min-h-11 rounded-full border border-primary/40 px-5 text-sm text-primary disabled:opacity-40">
          Simulate selected path
        </button>
        <button type="button" onClick={() => onAction("refine")} disabled={!selectedId} className="min-h-11 rounded-full border border-gold/30 px-5 text-sm text-gold disabled:opacity-40">
          Refine selected path
        </button>
        <button type="button" onClick={() => onAction("execute")} disabled={!selectedId} className="min-h-11 rounded-full border border-gold/50 bg-gold/10 px-5 text-sm text-gold disabled:opacity-40">
          Execute selected path
        </button>
      </div>
    </section>
  );
}

export function Engage() {
  const client = useQueryClient();
  const [objective, setObjective] = useState("");
  const [evidence, setEvidence] = useState("");
  const [constraints, setConstraints] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [follow, setFollow] = useState<{ id: string; kind: FollowUp } | null>(null);
  const [selectedPathwayId, setSelectedPathwayId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const generated = useRef(new Set<string>());
  const refreshed = useRef(new Set<string>());
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("run") ?? read(ACTIVE);
    if (id && /^[a-f0-9-]{36}$/i.test(id)) setActive(id);
    const draft = read(DRAFT);
    if (draft) setObjective(draft);
  }, []);
  const runQuery = useQuery({
    queryKey: ["ascension", "run", active],
    enabled: Boolean(active),
    queryFn: async () => (await getObjectiveStatus({ data: { requestId: active! } })).request,
    refetchInterval: (q) => (q.state.data && TERMINAL.has(q.state.data.status) ? false : 3000),
    retry: false,
  });
  const deliveryQuery = useQuery({
    queryKey: ["ascension", "delivery", active],
    enabled: Boolean(active),
    queryFn: () => getObjectiveDelivery({ data: { requestId: active! } }),
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "running" ? false : 3000),
    retry: false,
  });
  const history = useQuery({
    queryKey: ["ascension", "my-objectives"],
    enabled: historyOpen,
    queryFn: listMyObjectives,
    retry: false,
  });
  const prepare = useMutation({
    mutationFn: ({ id, retry = false }: { id: string; retry?: boolean }) =>
      prepareObjectiveDelivery({ data: { requestId: id, retry } }),
    onSuccess: (_data, vars) => {
      client.invalidateQueries({ queryKey: ["ascension", "delivery", vars.id] });
    },
  });
  const run = runQuery.data;
  const startDelivery = prepare.mutate;
  useEffect(() => {
    if (
      run?.engine === "governed_runtime" &&
      run.status === "verified" &&
      deliveryQuery.isSuccess &&
      !deliveryQuery.data &&
      !generated.current.has(run.id)
    ) {
      generated.current.add(run.id);
      startDelivery({ id: run.id });
    }
  }, [run?.id, run?.engine, run?.status, deliveryQuery.isSuccess, deliveryQuery.data, startDelivery]);
  useEffect(() => {
    if (run && governedPersisted(run) && !refreshed.current.has(run.id)) {
      refreshed.current.add(run.id);
      for (const surface of ["knowledgeverse", "chamber", "pathways", "ledger"])
        client.invalidateQueries({ queryKey: ["ascension", surface] });
    }
  }, [run, client]);
  const engage = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        save(DRAFT, objective);
        window.location.href = `/auth?next=${encodeURIComponent("/")}`;
        throw new Error("Sign in to submit your objective. Your words have been kept.");
      }
      return (
        await submitObjective({
          data: {
            objective: objective.trim(),
            evidence: evidence.split("\n").filter(Boolean),
            constraints: constraints.split("\n").filter(Boolean),
            ...(follow ? { parentRequestId: follow.id, followUp: follow.kind, selectedPathwayId: selectedPathwayId ?? undefined } : {}),
          },
        })
      ).request;
    },
    onSuccess: (request) => {
      client.setQueryData(["ascension", "run", request.id], request);
      setActive(request.id);
      save(ACTIVE, request.id);
      save(DRAFT, "");
      setObjective("");
      setEvidence("");
      setConstraints("");
      setFollow(null);
      setSelectedPathwayId(null);
      prepare.reset();
      client.invalidateQueries({ queryKey: ["ascension", "my-objectives"] });
      window.history.replaceState(null, "", `/?run=${encodeURIComponent(request.id)}`);
    },
  });
  let delivery: ObjectiveDelivery | null = null;
  let invalidDelivery: string | null = null;
  if (deliveryQuery.data?.status === "completed") {
    try {
      delivery = parseDelivery(deliveryQuery.data.response_payload);
    } catch (e) {
      invalidDelivery = e instanceof Error ? e.message : String(e);
    }
  }
  const followUp = (kind: FollowUp) => {
    if (!run) return;
    setFollow({ id: run.id, kind });
    setObjective(run.objective);
    setEvidence(strings(run.evidence).join("\n"));
    setConstraints(strings(run.constraints).join("\n"));
    input.current?.focus();
  };
  const error = engage.error ?? runQuery.error ?? deliveryQuery.error ?? prepare.error;
  const canEngage = Boolean(objective.trim()) && !engage.isPending;
  const staleDelivery =
    deliveryQuery.data?.status === "running" &&
    Date.now() - Date.parse(deliveryQuery.data.created_at) > 180000;
  const deliveryError =
    deliveryQuery.data?.error ??
    invalidDelivery ??
    (staleDelivery ? "Result generation was interrupted. Retry to resume this objective." : null);
  return (
    <div className="relative isolate mx-auto w-full max-w-6xl space-y-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-[0.08]"
        style={{ backgroundImage: `url(${chamberPlate.url})` }}
      />
      <section aria-label="Engage ASCENSION" className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-etched font-display text-2xl tracking-[0.3em] text-foreground sm:text-3xl">
          ASCENSION
        </h1>
        <label htmlFor="objective" className="block text-lg text-foreground/90">
          What do you want to accomplish?
        </label>
        {follow && (
          <p className="text-sm text-gold">
            {follow.kind === "execute"
              ? "Submit the selected result to the governed runtime"
              : `${follow.kind === "refine" ? "Refine" : "Continue"} this result`}{" "}
            · earlier context will be included.{" "}
            <button onClick={() => setFollow(null)} className="underline">
              Start separately
            </button>
          </p>
        )}
        <textarea
          id="objective"
          ref={input}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canEngage) engage.mutate();
          }}
          rows={4}
          maxLength={4000}
          disabled={engage.isPending}
          placeholder="Say it in your own words."
          className="w-full resize-y rounded-xl border border-primary/25 bg-void/60 px-5 py-4 text-base leading-relaxed focus:border-primary focus:outline-none"
        />
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">Add context or constraints</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label>
              Supporting context
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                rows={3}
                className="mt-2 w-full rounded-lg border border-border bg-void/60 p-3"
                placeholder="One item per line"
              />
            </label>
            <label>
              Constraints
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                rows={3}
                className="mt-2 w-full rounded-lg border border-border bg-void/60 p-3"
                placeholder="One constraint per line"
              />
            </label>
          </div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="min-h-11 text-sm text-muted-foreground"
          >
            Past results
          </button>
          <button
            type="button"
            disabled={!canEngage}
            onClick={() => engage.mutate()}
            className="min-h-12 rounded-full border border-primary/50 bg-primary/15 px-6 text-sm tracking-widest text-primary disabled:opacity-40"
          >
            {engage.isPending ? "ENGAGING…" : "ENGAGE ASCENSION"}
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
          >
            {error instanceof Error ? error.message : String(error)}
            {active && (
              <button
                onClick={() => {
                  runQuery.refetch();
                  deliveryQuery.refetch();
                }}
                className="ml-3 underline"
              >
                Retry status
              </button>
            )}
          </p>
        )}
        {active && runQuery.isSuccess && !run && (
          <p role="alert" className="text-sm text-muted-foreground">
            This saved objective is unavailable to your account.
          </p>
        )}
        {historyOpen && (
          <div className="rounded-xl border border-border p-4">
            {history.isPending ? (
              <p>Loading results…</p>
            ) : history.error ? (
              <p role="alert">Sign in to read your saved results.</p>
            ) : history.data?.items.length ? (
              history.data.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActive(item.id);
                    save(ACTIVE, item.id);
                    setHistoryOpen(false);
                    prepare.reset();
                    window.history.replaceState(null, "", `/?run=${encodeURIComponent(item.id)}`);
                  }}
                  className="block w-full border-b border-border/50 py-3 text-left text-sm text-foreground"
                >
                  {item.objective.slice(0, 180)}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No results yet.</p>
            )}
          </div>
        )}
        {run && (
          <section
            aria-label="Result"
            className="glass-inset space-y-5 rounded-xl border border-primary/25 p-5 sm:p-7"
          >
            <p className="label-eyebrow text-primary">RESULT</p>
            {delivery ? (
              <ResultContent delivery={delivery} />
            ) : deliveryError ? (
              <div role="alert" className="space-y-3">
                <p className="text-foreground">The answer could not be produced.</p>
                <p className="text-sm text-muted-foreground">{deliveryError}</p>
                <button
                  type="button"
                  disabled={prepare.isPending}
                  onClick={() => prepare.mutate({ id: run.id, retry: true })}
                  className="min-h-11 rounded-full border border-primary/40 px-4 text-sm text-primary"
                >
                  Retry result
                </button>
              </div>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                Preparing your answer or created solution…
              </p>
            )}
            {delivery && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => followUp("continue")} className="min-h-11 rounded-full border border-gold/30 px-5 text-sm text-gold">
                  Continue
                </button>
              </div>
            )}
            {delivery && (
              <PathwayChoices
                run={run}
                selectedId={selectedPathwayId ?? String(planningFor(run.result).selected["branch_id"] ?? "") || null}
                onSelect={setSelectedPathwayId}
                onAction={followUp}
              />
            )}
            {run.status === "queued" && (
              <p className="text-xs text-muted-foreground">
                Your objective is queued for the local runtime. It has not been claimed yet.
              </p>
            )}
            {(run.status === "claimed" || run.status === "running") && (
              <p role="status" className="text-xs text-primary">
                The local runtime is processing this objective.
              </p>
            )}
            {(run.status === "rejected" || run.status === "failed") && (
              <p role="alert" className="text-sm text-gold">
                {run.status === "rejected"
                  ? "The governed request was rejected."
                  : "The governed request failed."}{" "}
                {run.error}
              </p>
            )}
            {governedPersisted(run) && (
              <p className="text-xs text-primary">
                Recorded runtime artifacts verified and persisted.
              </p>
            )}
            <RuntimeDetails run={run} />
          </section>
        )}
      </section>
      <ConnectedKnowledgeWorld compact />
    </div>
  );
}
