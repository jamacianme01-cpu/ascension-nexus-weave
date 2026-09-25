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
  assessResult,
  governedPersisted,
  notProducedMessage,
  parseDelivery,
  receiptFiles,
  record,
  strings,
  type ObjectiveDelivery,
} from "@/lib/ascension/result-model";

const TERMINAL = new Set(["verified", "rejected", "failed"]);
const ACTIVE = "ascension.active-objective";
const DRAFT = "ascension.objective.draft";
const BOOK_TREE_SCENE = "/approved-scene/ascension-tree-behind-book-hq.jpg";
type FollowUp = "continue" | "refine";

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
  const mime = /\.svg$/i.test(name) ? "image/svg+xml" : /\.html?$/i.test(name) ? "text/html" : "text/plain";
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function statusText(run: ObjectiveRun, produced: boolean | null) {
  if (run.status === "queued") return "Waiting for your ASCENSION runtime to pick this up.";
  if (run.status === "claimed" || run.status === "running") return "Your ASCENSION runtime is working on this.";
  if (run.status === "rejected") return "Governance rejected this objective.";
  if (run.status === "failed") return "The run failed.";
  if (run.status === "verified")
    return produced
      ? "Finished. The result is below."
      : produced === false
        ? "The run finished, but the requested result has not been produced."
        : "The run finished. Checking what it returned…";
  return run.status;
}

export function ResultContent({ delivery }: { delivery: ObjectiveDelivery }) {
  const drawing = delivery.files.find((file) => /\.svg$/i.test(file.name));
  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl tracking-wide text-foreground">{delivery.title}</h2>
      <div className="rounded-xl border border-primary/20 bg-background/20 p-5 sm:p-6">
        <p className="whitespace-pre-wrap break-words text-base leading-7 text-foreground/95">
          {delivery.body}
        </p>
      </div>
      {drawing && (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.content)}`}
          alt={`Drawing for ${delivery.title}`}
          className="w-full rounded-xl border border-primary/25 bg-background/40"
        />
      )}
      {delivery.files.map((file) => (
        <div
          key={file.name}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4"
        >
          <div>
            <p className="text-xs tracking-[0.14em] text-gold uppercase">
              File · delivered by runtime
            </p>
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
            {delivery.limitations.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InspectDetails({ run }: { run: ObjectiveRun }) {
  const result = record(run.result);
  const files = receiptFiles(run.result);
  return (
    <details className="rounded-xl border border-border/70 px-4 py-3">
      <summary className="cursor-pointer text-sm text-muted-foreground">
        Inspect
      </summary>
      <div className="mt-4 space-y-3 text-sm leading-relaxed">
        <p>Guardian: {run.guardian_verdict ?? "not published"}</p>
        <p>AutoSync: {String(result["autosync_verdict"] ?? "not published")}</p>
        <p>Outcome: {run.outcome_status ?? "not published"}</p>
        {governedPersisted(run) && (
          <p className="text-gold">
            Verified Δ · K {String(result["delta_k"] ?? "—")} · W {String(result["delta_w"] ?? "—")}{" "}
            · U {String(result["delta_u"] ?? "—")}
          </p>
        )}
        {files.map((file, i) => (
          <p key={i} className="break-all text-muted-foreground">
            File receipt (stored bytes only): {file.name}
            {file.bytes !== null ? ` (${file.bytes} bytes)` : ""}
          </p>
        ))}
      </div>
    </details>
  );
}

export function Engage() {
  const client = useQueryClient();
  const [objective, setObjective] = useState("");
  const [evidence, setEvidence] = useState("");
  const [constraints, setConstraints] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [follow, setFollow] = useState<{ id: string; kind: FollowUp } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bookSequence, setBookSequence] = useState<"idle" | "powering">("idle");
  const [bookOpen, setBookOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
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

  useEffect(
    () => () => {
      sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

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

  useEffect(() => {
    if (!run || !TERMINAL.has(run.status)) return;
    setBookSequence("idle");
    setBookOpen(true);
    setRevealed(true);
    const timer = window.setTimeout(
      () => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [run?.id, run?.status]);

  const engage = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        // Keep the typed objective, then send the visitor to sign in.
        save(DRAFT, objective);
        window.location.href = `/auth?next=${encodeURIComponent("/")}`;
        throw new Error("Sign in to engage ASCENSION. Your objective has been kept.");
      }
      return (
        await submitObjective({
          data: {
            objective: objective.trim(),
            evidence: evidence
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
            constraints: constraints
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
            ...(follow
              ? {
                  parentRequestId: follow.id,
                  followUp: follow.kind,
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
      prepare.reset();
      void client.invalidateQueries({ queryKey: ["ascension", "my-objectives"] });
      window.history.replaceState(null, "", `/?run=${encodeURIComponent(request.id)}`);

      // Show YOUR ANSWER right away so QUEUED → RUNNING progress is visible.
      setBookOpen(true);
      setRevealed(true);
      window.setTimeout(
        () => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        180,
      );
    },
  });

  let delivery: ObjectiveDelivery | null = null;
  let invalidDelivery: string | null = null;
  let notProduced: string | null = null;
  if (deliveryQuery.data?.status === "completed" && run) {
    try {
      const parsed = parseDelivery(deliveryQuery.data.response_payload);
      // Re-check on screen too: a stale projection must never pass as a result.
      const check = assessResult(run.objective, parsed.body, parsed.files);
      if (parsed.kind === "not_produced" || !check.produced) {
        notProduced =
          parsed.kind === "not_produced"
            ? parsed.body
            : `${notProducedMessage(check.kind)} What came back${check.reason ? ` — ${check.reason}` : ""} — is not the result you asked for.`;
      } else {
        delivery = { ...parsed, files: check.files };
      }
    } catch (cause) {
      invalidDelivery = cause instanceof Error ? cause.message : String(cause);
    }
  }
  const produced = delivery ? true : notProduced ? false : null;

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
    setBookOpen(true);
    setRevealed(false);
    setBookSequence("powering");
    engage.mutate();
  };
  const deliveryError = deliveryQuery.data?.error ?? invalidDelivery;

  return (
    <div
      className="ascension-world relative isolate mx-auto w-full max-w-none"
      data-book-sequence={bookSequence === "idle" ? undefined : bookSequence}
      data-book-open={bookOpen ? "true" : undefined}
      data-has-run={run && revealed ? "true" : undefined}
    >
      <section aria-label="Engage ASCENSION" className="ascension-command">
        <div className="ascension-stage">
          <div className="ascension-scene-hero" aria-hidden="true">
            <img
              className="ascension-tree-scene"
              src={BOOK_TREE_SCENE}
              alt=""
              draggable={false}
            />
          </div>

          <label
            htmlFor="objective"
            className="block text-center font-display text-lg tracking-wide text-foreground/95"
          >
            What do you want to accomplish?
          </label>

          {follow && (
            <div className="rounded-xl border border-gold/25 bg-gold/5 p-3 text-sm text-gold">
              {follow.kind === "refine" ? "Refining" : "Continuing"} the previous result
              <button type="button" onClick={() => setFollow(null)} className="ml-3 underline">
                Start separately
              </button>
            </div>
          )}

          <textarea
            id="objective"
            ref={inputRef}
            value={objective}
            placeholder="Tell ASCENSION what you want to accomplish…"
            onChange={(event) => setObjective(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && canEngage) {
                event.preventDefault();
                startBookSequence();
              }
            }}
            rows={5}
            maxLength={4000}
            disabled={engage.isPending}
            className="w-full resize-y rounded-xl border border-gold/30 bg-void/70 px-5 py-4 text-base leading-relaxed focus:border-gold/60 focus:outline-none"
          />

          <details className="rounded-xl border border-border/60 px-4 py-3 text-sm text-muted-foreground">
            <summary className="cursor-pointer">
              Optional: add source evidence or constraints
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="block text-sm text-foreground">
                  What evidence or source information should ASCENSION use?
                </span>
                <textarea
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-border bg-void/60 p-3"
                />
              </label>
              <label className="block">
                <span className="block text-sm text-foreground">
                  What requirements or limits must ASCENSION preserve?
                </span>
                <textarea
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-border bg-void/60 p-3"
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
              {historyOpen ? "Close past results" : "Past results"}
            </button>
            <button
              type="button"
              disabled={!canEngage || bookSequence !== "idle"}
              onClick={startBookSequence}
              className="min-h-12 rounded-full border border-gold/55 bg-gold/10 px-7 text-sm font-medium tracking-[0.14em] text-gold disabled:opacity-40"
            >
              {bookSequence !== "idle" || engage.isPending
                ? "ENGAGING ASCENSION…"
                : "ENGAGE ASCENSION"}
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
                      window.setTimeout(
                        () =>
                          answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                        100,
                      );
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
                <p className="text-sm text-muted-foreground">No saved results yet.</p>
              )}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive"
            >
              {error instanceof Error ? error.message : String(error)}
            </p>
          )}
        </div>
      </section>

      {run && revealed && (
        <section
          ref={answerRef}
          aria-label="Your answer"
          className="mx-auto max-w-4xl scroll-mt-24 space-y-5 rounded-2xl border border-primary/30 bg-void/80 p-5 shadow-2xl sm:p-7"
        >
          <div>
            <p className="label-eyebrow text-primary">YOUR ANSWER</p>
            <p className="mt-2 text-sm text-muted-foreground">{run.objective}</p>
            <p role="status" className="mt-3 text-sm text-foreground/90">
              {statusText(run, produced)}
            </p>
          </div>

          {delivery ? (
            <ResultContent delivery={delivery} />
          ) : notProduced ? (
            <div role="alert" className="rounded-xl border border-gold/35 bg-gold/5 p-5">
              <p className="whitespace-pre-wrap text-foreground">{notProduced}</p>
              <p className="mt-3 text-sm text-muted-foreground">
                A finished or verified run is not the same as your result. Nothing here is
                offered for download.
              </p>
            </div>
          ) : deliveryError ? (
            <div role="alert" className="rounded-xl border border-gold/30 p-4">
              <p className="text-foreground">No readable result could be shown.</p>
              <p className="mt-2 text-sm text-muted-foreground">{deliveryError}</p>
              <button
                type="button"
                disabled={prepare.isPending}
                onClick={() => prepare.mutate({ id: run.id, retry: true })}
                className="mt-4 min-h-11 rounded-full border border-primary/40 px-5 text-sm text-primary"
              >
                TRY AGAIN
              </button>
            </div>
          ) : null}

          {TERMINAL.has(run.status) && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => followUp("continue")}
                className="min-h-11 rounded-full border border-primary/40 px-5 text-sm text-primary"
              >
                CONTINUE
              </button>
              <button
                type="button"
                onClick={() => followUp("refine")}
                className="min-h-11 rounded-full border border-gold/40 px-5 text-sm text-gold"
              >
                REFINE
              </button>
            </div>
          )}

          <InspectDetails run={run} />
        </section>
      )}
    </div>
  );
}
