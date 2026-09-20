import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { APPROVED_OPENING_SCENE } from "@/lib/ascension/approved-opening-scene";
import {
  getObjectiveStatus,
  listMyObjectives,
  submitObjective,
  type ObjectiveRun,
} from "@/lib/ascension/objectives.functions";
import { getObjectiveDelivery, prepareObjectiveDelivery } from "@/lib/ascension/delivery.functions";
import {
  branchTitle,
  governedPersisted,
  parseDelivery,
  planningFor,
  receiptFiles,
  record,
  strings,
  type ObjectiveDelivery,
} from "@/lib/ascension/result-model";

const TERMINAL = new Set(["verified", "rejected", "failed"]);
const ACTIVE = "ascension.active-objective";
const DRAFT = "ascension.objective.draft";
const CLOSED_BOOK_SCENE = APPROVED_OPENING_SCENE;
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

function statusText(run: ObjectiveRun) {
  if (run.status === "queued") return "Queued — waiting for the governed runtime to claim it.";
  if (run.status === "claimed") return "Claimed — ASCENSION has the objective.";
  if (run.status === "running") return "Running — ASCENSION is decomposing, simulating, governing and executing.";
  if (run.status === "verified") return "Verified — the governed runtime has finished and published its result.";
  if (run.status === "rejected") return "Rejected by governance.";
  if (run.status === "failed") return "The governed run failed.";
  return run.status;
}

function Progress({ run }: { run: ObjectiveRun }) {
  const order = ["QUEUED", "CLAIMED", "RUNNING", "VERIFIED"];
  const current = Math.max(0, order.indexOf(run.status.toUpperCase()));
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-wrap gap-2">
        {order.map((stage, index) => (
          <span
            key={stage}
            className={`rounded-full border px-3 py-1 text-[0.68rem] tracking-[0.14em] ${
              index <= current
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {stage}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{statusText(run)}</p>
    </div>
  );
}

export function ResultContent({ delivery }: { delivery: ObjectiveDelivery }) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl tracking-wide text-foreground">{delivery.title}</h2>
      <div className="rounded-xl border border-primary/20 bg-background/20 p-5 sm:p-6">
        <p className="whitespace-pre-wrap break-words text-base leading-7 text-foreground/95">
          {delivery.body}
        </p>
      </div>
      {delivery.files.map((file) => (
        <div
          key={file.name}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4"
        >
          <div>
            <p className="text-xs tracking-[0.14em] text-gold uppercase">Created artifact</p>
            <p className="mt-1 break-all text-sm text-foreground">{file.name}</p>
          </div>
          <button
            type="button"
            onClick={() => download(file.name, file.content)}
            className="min-h-11 rounded-full border border-gold/50 bg-gold/10 px-5 text-sm text-gold"
          >
            DOWNLOAD
          </button>
        </div>
      ))}
      {delivery.limitations.length > 0 && (
        <div className="rounded-xl border border-gold/25 p-4">
          <p className="text-xs tracking-[0.14em] text-gold uppercase">What remains</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {delivery.limitations.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function RuntimeDetails({ run }: { run: ObjectiveRun }) {
  const result = record(run.result);
  const files = receiptFiles(run.result);
  return (
    <details className="rounded-xl border border-border/70 px-4 py-3">
      <summary className="cursor-pointer text-sm text-muted-foreground">Verification details</summary>
      <div className="mt-4 space-y-3 text-sm leading-relaxed">
        <p>Guardian: {run.guardian_verdict ?? "not published"}</p>
        <p>AutoSync: {String(result["autosync_verdict"] ?? "not published")}</p>
        <p>Outcome: {run.outcome_status ?? "not published"}</p>
        {governedPersisted(run) && (
          <p className="text-gold">
            Verified Δ · K {String(result["delta_k"] ?? "—")} · W {String(result["delta_w"] ?? "—")} · U {String(result["delta_u"] ?? "—")}
          </p>
        )}
        {files.map((file, i) => (
          <p key={i} className="break-all text-muted-foreground">
            Artifact: {file.name}{file.bytes !== null ? ` (${file.bytes} bytes)` : ""}
          </p>
        ))}
      </div>
    </details>
  );
}

function Pathways({
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
  const planning = planningFor(run.result);
  if (!planning.branches.length) return null;
  const recommended = String(planning.selected["branch_id"] ?? "");
  const activeId = selectedId || recommended;

  return (
    <section className="space-y-4 rounded-2xl border border-primary/20 bg-void/50 p-5 sm:p-6" aria-label="Pathways">
      <div>
        <p className="label-eyebrow text-primary">POSSIBLE FUTURES</p>
        <h2 className="mt-2 font-display text-xl text-foreground">Choose the pathway you want</h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {planning.branches.map((branch, index) => {
          const id = String(branch["branch_id"] ?? index);
          const active = id === activeId;
          const isRecommended = id === recommended;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`rounded-xl border p-4 text-left ${
                active ? "border-gold/55 bg-gold/10" : "border-primary/20 bg-primary/5"
              }`}
            >
              <p className={active ? "text-gold" : "text-primary"}>{branchTitle(branch)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {isRecommended ? "ASCENSION RECOMMENDED" : "ALTERNATIVE FUTURE"}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-foreground/80">
                {strings(branch["actions"]).join(" · ") || "Pathway actions are recorded in the governed result."}
              </p>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onAction("simulate")} disabled={!activeId} className="min-h-11 rounded-full border border-primary/40 px-5 text-sm text-primary disabled:opacity-40">SIMULATE</button>
        <button type="button" onClick={() => onAction("refine")} disabled={!activeId} className="min-h-11 rounded-full border border-gold/30 px-5 text-sm text-gold disabled:opacity-40">REFINE</button>
        <button type="button" onClick={() => onAction("execute")} disabled={!activeId} className="min-h-11 rounded-full border border-gold/50 bg-gold/10 px-5 text-sm text-gold disabled:opacity-40">EXECUTE</button>
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
  const [bookSequence, setBookSequence] = useState<"idle" | "rocking" | "opening" | "emerging" | "tree">("idle");
  const [bookOpen, setBookOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [bookStep, setBookStep] = useState(0);
  const sequenceTimers = useRef<number[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("run") ?? read(ACTIVE);
    if (id && /^[a-f0-9-]{36}$/i.test(id)) {
      setActive(id);
      setBookOpen(true);
      setRevealed(true);
    }
    const draft = read(DRAFT);
    if (draft) setObjective(draft);
  }, []);

  useEffect(() => () => {
    sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const runQuery = useQuery({
    queryKey: ["ascension", "run", active],
    enabled: Boolean(active),
    queryFn: async () => (await getObjectiveStatus({ data: { requestId: active! } })).request,
    refetchInterval: (q) => (q.state.data && TERMINAL.has(q.state.data.status) ? false : 2500),
    retry: false,
  });

  const deliveryQuery = useQuery({
    queryKey: ["ascension", "delivery", active],
    enabled: Boolean(active),
    queryFn: () => getObjectiveDelivery({ data: { requestId: active! } }),
    refetchInterval: (q) => {
      if (!active) return false;
      const payload = q.state.data?.response_payload;
      if (q.state.data?.status !== "completed") return 3000;
      if (payload?.files?.length) return false;
      // The governed run is finished and its readable answer is projected.
      // Keep one slower poll only while artifact transport could still arrive.
      const status = runQuery.data?.status ?? "";
      return TERMINAL.has(status) ? false : 4000;
    },
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
      void client.invalidateQueries({ queryKey: ["ascension", "delivery", vars.id] });
    },
  });

  const run = runQuery.data;

  const engage = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        save(DRAFT, objective);
        window.location.href = `/auth?next=${encodeURIComponent("/")}`;
        throw new Error("Sign in is required to send the objective to the governed runtime. Your words were kept.");
      }
      return (
        await submitObjective({
          data: {
            objective: objective.trim(),
            evidence: evidence.split("\n").map((v) => v.trim()).filter(Boolean),
            constraints: constraints.split("\n").map((v) => v.trim()).filter(Boolean),
            ...(follow
              ? {
                  parentRequestId: follow.id,
                  followUp: follow.kind,
                  ...(selectedPathwayId ? { selectedPathwayId } : {}),
                }
              : {}),
          },
        })
      ).request;
    },
    onError: () => {
      // Return the Book to a usable state so the objective can be sent again.
      sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
      sequenceTimers.current = [];
      setBookSequence("idle");
      setBookStep(0);
      setBookOpen(Boolean(run));
      setRevealed(Boolean(run));
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
      void client.invalidateQueries({ queryKey: ["ascension", "my-objectives"] });
      window.history.replaceState(null, "", `/?run=${encodeURIComponent(request.id)}`);
    },
  });



  let delivery: ObjectiveDelivery | null = null;
  let invalidDelivery: string | null = null;
  if (deliveryQuery.data?.status === "completed") {
    try {
      delivery = parseDelivery(deliveryQuery.data.response_payload);
    } catch (cause) {
      invalidDelivery = cause instanceof Error ? cause.message : String(cause);
    }
  }

  const followUp = (kind: FollowUp) => {
    if (!run) return;
    setFollow({ id: run.id, kind });
    setObjective(run.objective);
    setEvidence(strings(run.evidence).join("\n"));
    setConstraints(strings(run.constraints).join("\n"));
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => inputRef.current?.focus(), 250);
  };

  const error = engage.error ?? runQuery.error ?? deliveryQuery.error ?? prepare.error;
  const canEngage = Boolean(objective.trim()) && !engage.isPending;
  const startBookSequence = () => {
    if (!canEngage || bookSequence !== "idle") return;
    sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
    sequenceTimers.current = [];
    const later = (delay: number, fn: () => void) => {
      sequenceTimers.current.push(window.setTimeout(fn, delay));
    };
    setBookOpen(false);
    setRevealed(false);
    setBookStep(0);
    setBookSequence("rocking");
    // The real governed objective run starts on the single press. The Book
    // sequence is presentation only and never gates submission.
    engage.mutate();
    later(1350, () => setBookSequence("opening"));
    later(2050, () => {
      setBookSequence("emerging");
      setBookStep(1);
    });
    [2, 3, 4, 5, 6].forEach((step, index) => {
      later(2350 + index * 320, () => setBookStep(step));
    });
    later(4050, () => {
      setBookSequence("tree");
      setBookStep(6);
    });
    // Return the Book to an open, usable state and reveal YOUR ANSWER below it.
    later(4650, () => {
      setBookSequence("idle");
      setBookStep(0);
      setBookOpen(true);
      setRevealed(true);
      window.setTimeout(
        () => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        120,
      );
    });
  };
  const deliveryError = deliveryQuery.data?.error ?? invalidDelivery;
  const planning = useMemo(() => (run ? planningFor(run.result) : null), [run]);

  return (
    <div
      className="ascension-world relative isolate mx-auto w-full max-w-none"
      data-book-sequence={bookSequence === "idle" ? undefined : bookSequence}
      data-book-step={bookStep || undefined}
      data-book-open={bookOpen ? "true" : undefined}
      data-has-run={run && revealed ? "true" : undefined}
    >


      <section aria-label="Engage ASCENSION" className="ascension-command mx-auto max-w-4xl space-y-5">
        <div className="ascension-book-scene" aria-hidden="true">
          <img className="ascension-book-scene-closed" src={CLOSED_BOOK_SCENE} alt="" />
        </div>
        <div className="text-center">
          <p className="label-eyebrow text-gold">THE BOOK</p>
          <h1 className="text-etched mt-2 font-display text-2xl tracking-[0.3em] text-foreground sm:text-3xl">ASCENSION</h1>
        </div>

        <label htmlFor="objective" className="block text-center font-display text-lg tracking-wide text-foreground/95">
          What do you want ASCENSION to answer, solve, build, analyze, simulate, or execute?
        </label>

        {follow && (
          <div className="rounded-xl border border-gold/25 bg-gold/5 p-3 text-sm text-gold">
            Continuing the previous governed result · {follow.kind.toUpperCase()}
            <button type="button" onClick={() => setFollow(null)} className="ml-3 underline">Start separately</button>
          </div>
        )}

        <textarea
          id="objective"
          ref={inputRef}
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && canEngage) startBookSequence();
          }}
          rows={5}
          maxLength={4000}
          disabled={engage.isPending}
          className="w-full resize-y rounded-xl border border-gold/30 bg-void/70 px-5 py-4 text-base leading-relaxed focus:border-gold/60 focus:outline-none"
        />

        <details className="rounded-xl border border-border/60 px-4 py-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer">Optional: add source evidence or constraints</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm text-foreground">What evidence or source information should ASCENSION use?</span>
              <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-border bg-void/60 p-3" />
            </label>
            <label className="block">
              <span className="block text-sm text-foreground">What requirements or limits must ASCENSION preserve?</span>
              <textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-border bg-void/60 p-3" />
            </label>
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setHistoryOpen((v) => !v)} className="min-h-11 text-sm text-muted-foreground">
            {historyOpen ? "Close past results" : "Past results"}
          </button>
          <button
            type="button"
            disabled={!canEngage || bookSequence !== "idle"}
            onClick={startBookSequence}
            className="min-h-12 rounded-full border border-gold/55 bg-gold/10 px-7 text-sm font-medium tracking-[0.14em] text-gold disabled:opacity-40"
          >
            {bookSequence !== "idle" || engage.isPending ? "ENGAGING ASCENSION…" : "ENGAGE ASCENSION"}
          </button>
        </div>

        {historyOpen && (
          <div className="rounded-xl border border-border p-4">
            {history.isPending ? (
              <p className="text-sm text-muted-foreground">Loading past results…</p>
            ) : history.error ? (
              <p className="text-sm text-gold">Sign in to read saved results.</p>
            ) : history.data?.items.length ? (
              history.data.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActive(item.id);
                    setBookOpen(true);
                    setRevealed(true);
                    save(ACTIVE, item.id);
                    setHistoryOpen(false);
                    window.history.replaceState(null, "", `/?run=${encodeURIComponent(item.id)}`);
                    window.setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                  }}
                  className="block w-full border-b border-border/50 py-3 text-left text-sm text-foreground"
                >
                  {item.objective.slice(0, 180)}
                  <span className="mt-1 block text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No saved results yet.</p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </p>
        )}
      </section>

      {run && revealed && (
        <section ref={answerRef} aria-label="Answer" className="mx-auto max-w-4xl scroll-mt-24 space-y-5 rounded-2xl border border-primary/30 bg-void/80 p-5 shadow-2xl sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label-eyebrow text-primary">YOUR ANSWER</p>
              <p className="mt-2 text-sm text-muted-foreground">{run.objective}</p>
            </div>
            <a href="/architecture" className="rounded-full border border-gold/30 px-4 py-2 text-xs text-gold">VIEW ARCHITECTURE</a>
          </div>

          <Progress run={run} />

          {delivery ? (
            <ResultContent delivery={delivery} />
          ) : deliveryError ? (
            <div role="alert" className="rounded-xl border border-gold/30 p-4">
              <p className="text-foreground">ASCENSION did not produce a readable answer.</p>
              <p className="mt-2 text-sm text-muted-foreground">{deliveryError}</p>
              <button type="button" disabled={prepare.isPending} onClick={() => prepare.mutate({ id: run.id, retry: true })} className="mt-4 min-h-11 rounded-full border border-primary/40 px-5 text-sm text-primary">
                RETRY ANSWER
              </button>
            </div>
          ) : (
            <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-5">
              <p className="font-display text-lg text-foreground">
                {run.status === "verified" ? "Finalizing your answer…" : "ASCENSION is working on it…"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                The answer will appear in this exact panel. You do not have to open another screen.
              </p>
            </div>
          )}

          {delivery && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => followUp("continue")} className="min-h-11 rounded-full border border-primary/40 px-5 text-sm text-primary">CONTINUE THIS RESULT</button>
              <a href="/knowledgeverse" className="inline-flex min-h-11 items-center rounded-full border border-gold/35 px-5 text-sm text-gold">OPEN KNOWLEDGEVERSE</a>
            </div>
          )}

          <RuntimeDetails run={run} />
        </section>
      )}

      {run && revealed && planning?.branches.length ? (
        <div className="mx-auto max-w-4xl">
          <Pathways run={run} selectedId={selectedPathwayId} onSelect={setSelectedPathwayId} onAction={followUp} />
        </div>
      ) : null}

      {run && revealed && (
        <section className="mx-auto max-w-4xl rounded-2xl border border-primary/20 bg-void/65 p-4 sm:p-5">
          <p className="label-eyebrow text-primary">HOW TO USE ASCENSION</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["1", "TYPE", "Ask a question or state exactly what you want accomplished."],
              ["2", "ENGAGE", "Press ENGAGE ASCENSION once. The governed runtime takes it from there."],
              ["3", "ANSWER", "Your answer or created solution appears directly below the Book."],
            ].map(([n, title, copy]) => (
              <div key={n} className="rounded-xl border border-primary/15 bg-background/20 p-4">
                <p className="text-xs text-gold">STEP {n}</p>
                <p className="mt-1 font-display text-sm tracking-wide text-foreground">{title}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
