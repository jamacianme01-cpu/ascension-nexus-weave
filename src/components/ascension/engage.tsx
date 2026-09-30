import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getObjectiveStatus,
  listMyObjectives,
  submitObjective,
  type ObjectiveRun,
} from "@/lib/ascension/objectives.functions";
import {
  getObjectiveDelivery,
  prepareObjectiveDelivery,
  type DeliveryState,
} from "@/lib/ascension/delivery.functions";
import {
  getGuestObjectiveDelivery,
  getGuestObjectiveStatus,
  prepareGuestObjectiveDelivery,
  submitGuestObjective,
} from "@/lib/ascension/guest.functions";
import {
  assessResult,
  branchTitle,
  governedPersisted,
  notProducedMessage,
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
const ACCESS = "ascension.active-access";
const GUEST_TOKEN = "ascension.active-guest-token";
const BOOK_TREE_SCENE = "/approved-scene/ascension-tree-behind-book-hq.jpg";
type FollowUp = "continue" | "refine";
type FollowState = { id: string; kind: FollowUp; pathwayLabel?: string };

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

function cleanDisplayText(value: string) {
  return value
    .replace(/&#x20;|&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/(^|\n)\*([^*\n]+)\*/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}


function labelToken(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}


function splitResultBody(value: string) {
  const cleaned = cleanDisplayText(value);
  const marker = "General-knowledge explanation:";
  const markerIndex = cleaned.indexOf(marker);
  const internal =
    markerIndex >= 0 ? cleaned.slice(0, markerIndex).trim() : "";
  const main =
    markerIndex >= 0 ? cleaned.slice(markerIndex + marker.length).trim() : cleaned;

  const firstBreak = main.search(/\n\s*\n/);
  let summary = firstBreak > 0 ? main.slice(0, firstBreak).trim() : main;
  let detail = firstBreak > 0 ? main.slice(firstBreak).trim() : "";

  if (summary.length > 680) {
    const sentenceCut = summary.slice(0, 680).lastIndexOf(". ");
    const cut = sentenceCut > 320 ? sentenceCut + 1 : 680;
    detail = [summary.slice(cut).trim(), detail].filter(Boolean).join("\n\n");
    summary = summary.slice(0, cut).trim();
  }

  return { summary, detail, internal };
}

function AscensionSignal({ run, delivery }: { run: ObjectiveRun; delivery: ObjectiveDelivery }) {
  const planning = planningFor(run.result);
  const result = record(run.result);
  const pathCount =
    delivery.pathways.length + (delivery.blend ? 1 : 0) || planning.branches.length;
  const guardian = run.guardian_verdict ?? "—";
  const autosync = String(result["autosync_verdict"] ?? "—");
  const delta =
    governedPersisted(run)
      ? `K+${String(result["delta_k"] ?? 0)} · W+${String(result["delta_w"] ?? 0)} · U+${String(result["delta_u"] ?? 0)}`
      : "PENDING";

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        ["SPIRAL", pathCount ? `${pathCount} PATHS` : "ACTIVE"],
        ["GUARDIAN", guardian],
        ["AUTOSYNC", autosync],
        ["VERIFIED Δ", delta],
      ].map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-3 text-center"
        >
          <p className="text-[0.58rem] tracking-[0.2em] text-muted-foreground uppercase">{label}</p>
          <p className="mt-1 text-xs font-medium tracking-wide text-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}

function SpiralPathways({
  run,
  delivery,
  onChoosePathway,
}: {
  run: ObjectiveRun;
  delivery: ObjectiveDelivery;
  onChoosePathway: (pathway: ObjectiveDelivery["pathways"][number]) => void;
}) {
  const planning = planningFor(run.result);
  const planningRecord = record(record(run.result)["objective_planning"]);
  const mesh = record(planningRecord["engine_mesh"]);
  const engines = record(mesh["engines"]);
  const spiral = record(engines["Spiral"]);
  const spiralOutput = Array.isArray(spiral["output"]) ? spiral["output"].map(record) : [];
  const expandedForms = [
    ...new Set(
      spiralOutput.flatMap((item) =>
        Array.isArray(item["expanded_forms"])
          ? item["expanded_forms"].filter((value): value is string => typeof value === "string")
          : [],
      ),
    ),
  ];
  const selectedId =
    typeof planning.selected["branch_id"] === "string" ? planning.selected["branch_id"] : null;
  const choices = delivery.blend
    ? [...delivery.pathways, delivery.blend]
    : delivery.pathways;
  const [activeChoiceId, setActiveChoiceId] = useState<string | null>(null);
  const activeChoice = choices.find((choice) => choice.id === activeChoiceId) ?? null;
  const activeIsBlend = Boolean(activeChoice && delivery.blend?.id === activeChoice.id);

  if (!planning.branches.length && !expandedForms.length && !choices.length) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-eyebrow text-primary">SPIRAL · OUTCOME PREDICTOR</p>
          <h3 className="mt-1 font-display text-xl text-foreground">Choose a reality</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Read the possibilities visually first. Choose one to reveal its reasoning, steps and
            tradeoffs.
          </p>
        </div>
        {expandedForms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {expandedForms.map((form) => (
              <span
                key={form}
                className="rounded-full border border-primary/25 bg-primary/[0.04] px-2.5 py-1 text-[0.65rem] text-primary"
              >
                {labelToken(form)}
              </span>
            ))}
          </div>
        )}
      </div>

      {choices.length > 0 && (
        <div className="ascension-pathway-strip flex snap-x gap-3 overflow-x-auto pb-2">
          {choices.map((pathway, index) => {
            const isBlend = delivery.blend?.id === pathway.id;
            const isActive = activeChoiceId === pathway.id;
            return (
              <button
                key={pathway.id}
                type="button"
                onClick={() => setActiveChoiceId(pathway.id)}
                aria-pressed={isActive}
                className={
                  isBlend
                    ? "group min-w-[84%] snap-start overflow-hidden rounded-2xl border border-gold/55 bg-gradient-to-br from-gold/[0.12] to-background/20 text-left shadow-xl transition sm:min-w-[380px] sm:max-w-[440px]"
                    : isActive
                      ? "group min-w-[84%] snap-start overflow-hidden rounded-2xl border border-primary/65 bg-primary/[0.08] text-left shadow-xl transition sm:min-w-[380px] sm:max-w-[440px]"
                      : "group min-w-[84%] snap-start overflow-hidden rounded-2xl border border-primary/25 bg-background/20 text-left transition hover:border-primary/45 sm:min-w-[380px] sm:max-w-[440px]"
                }
              >
                <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-[#f4f7f9]">
                  {pathway.visual_svg ? (
                    <img
                      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pathway.visual_svg)}`}
                      alt={`Visual pathway: ${pathway.label}`}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(54,205,228,.18),transparent_60%)]">
                      <span className="font-display text-4xl text-primary/70">
                        {isBlend ? "BLEND" : String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pb-3 pt-10">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p
                          className={
                            isBlend
                              ? "text-[0.62rem] tracking-[0.18em] text-gold uppercase"
                              : "text-[0.62rem] tracking-[0.18em] text-primary uppercase"
                          }
                        >
                          {isBlend ? "BLEND · SPIRAL + OUTCOME" : `PATH ${String(index + 1).padStart(2, "0")}`}
                        </p>
                        <h4 className="mt-1 text-base font-medium text-white">
                          {cleanDisplayText(pathway.label)}
                        </h4>
                      </div>
                      {pathway.outcome_score !== null && (
                        <span className="rounded-full border border-white/30 bg-black/35 px-2.5 py-1 text-[0.65rem] text-white">
                          {Math.round(pathway.outcome_score * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {activeChoice && (
        <div
          className={
            activeIsBlend
              ? "rounded-2xl border border-gold/45 bg-gold/[0.05] p-4 sm:p-5"
              : "rounded-2xl border border-primary/35 bg-primary/[0.04] p-4 sm:p-5"
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={activeIsBlend ? "label-eyebrow text-gold" : "label-eyebrow text-primary"}>
                {activeIsBlend ? "BLEND SELECTED" : "PATH SELECTED"}
              </p>
              <h4 className="mt-1 font-display text-xl text-foreground">
                {cleanDisplayText(activeChoice.label)}
              </h4>
            </div>
            {activeChoice.spiral_form && (
              <span
                className={
                  activeIsBlend
                    ? "rounded-full border border-gold/35 px-2.5 py-1 text-xs text-gold"
                    : "rounded-full border border-primary/30 px-2.5 py-1 text-xs text-primary"
                }
              >
                {labelToken(activeChoice.spiral_form)}
              </span>
            )}
          </div>

          <p className="mt-3 text-sm leading-6 text-foreground/90">
            {cleanDisplayText(activeChoice.summary)}
          </p>

          {activeIsBlend && delivery.blend && (
            <div className="mt-3 rounded-xl border border-gold/20 bg-background/20 p-3">
              <p className="text-xs font-medium tracking-wide text-gold">WHY THIS BLEND</p>
              <p className="mt-2 text-sm leading-6 text-foreground/85">
                {cleanDisplayText(delivery.blend.blend_reason)}
              </p>
              {delivery.blend.blend_from.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Combines: {delivery.blend.blend_from.map(cleanDisplayText).join(" · ")}
                </p>
              )}
            </div>
          )}

          {activeChoice.outcome_reason && (
            <div className="mt-3">
              <p className="text-xs font-medium text-foreground/75">Outcome Predictor</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {cleanDisplayText(activeChoice.outcome_reason)}
              </p>
            </div>
          )}

          {activeChoice.steps.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-foreground/80">Steps</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-foreground/90">
                {activeChoice.steps.map((step, stepIndex) => (
                  <li key={stepIndex}>{cleanDisplayText(step)}</li>
                ))}
              </ol>
            </div>
          )}

          {activeChoice.tradeoffs.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-foreground/80">Tradeoffs</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {activeChoice.tradeoffs.map((tradeoff, tradeoffIndex) => (
                  <li key={tradeoffIndex}>{cleanDisplayText(tradeoff)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChoosePathway(activeChoice)}
              className={
                activeIsBlend
                  ? "rounded-full border border-gold/55 bg-gold/12 px-5 py-3 text-xs font-medium tracking-[0.1em] text-gold"
                  : "rounded-full border border-primary/50 bg-primary/10 px-5 py-3 text-xs font-medium tracking-[0.1em] text-primary"
              }
            >
              USE THIS PATH
            </button>
            <button
              type="button"
              onClick={() => setActiveChoiceId(null)}
              className="rounded-full border border-border px-4 py-3 text-xs text-muted-foreground"
            >
              BACK TO VISUALS
            </button>
          </div>
        </div>
      )}

      {planning.branches.length > 0 && (
        <details className="rounded-xl border border-border/70 bg-void/30 px-4 py-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Governed DTF execution branches · {planning.branches.length}
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {planning.branches.map((branch, index) => {
              const branchId =
                typeof branch["branch_id"] === "string"
                  ? branch["branch_id"]
                  : typeof branch["id"] === "string"
                    ? branch["id"]
                    : `path-${index + 1}`;
              const selected = selectedId === branchId;
              const evaluation = record(branch["evaluation"]);
              const confidence =
                typeof branch["confidence"] === "number"
                  ? branch["confidence"]
                  : typeof evaluation["confidence"] === "number"
                    ? evaluation["confidence"]
                    : null;
              const risks = strings(branch["risks"]);
              return (
                <div
                  key={branchId}
                  className={
                    selected
                      ? "rounded-lg border border-gold/45 bg-gold/5 p-3"
                      : "rounded-lg border border-border/60 p-3"
                  }
                >
                  <p className="text-xs font-medium text-foreground">{branchTitle(branch)}</p>
                  <p className="mt-1 text-[0.65rem] text-muted-foreground">
                    {selected ? "CLARITY SELECTED" : String(branch["status"] ?? "SIMULATED")}
                    {confidence !== null ? ` · ${Math.round(confidence * 100)}%` : ""}
                  </p>
                  {risks[0] && (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Risk: {cleanDisplayText(risks[0])}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
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
  if (run.status === "queued") return "Objective received. Waiting for ASCENSION runtime.";
  if (run.status === "claimed" || run.status === "running") return "ASCENSION is processing your objective.";
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

export function ResultContent({ delivery, source }: { delivery: ObjectiveDelivery; source?: "governed" | "external_draft" | null }) {
  const drawing = delivery.files.find((file) => /\.svg$/i.test(file.name));
  const body = splitResultBody(delivery.body);
  const otherFiles = delivery.files.filter((file) => file !== drawing);
  const hasVisualChoices = delivery.pathways.length > 0 || Boolean(delivery.blend);

  return (
    <div className="space-y-4">
      {drawing && (
        <section className="ascension-artifact-hero overflow-hidden rounded-2xl border border-primary/40 bg-background/30 shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-primary/20 px-4 py-3 sm:px-5">
            <div>
              <p className="label-eyebrow text-primary">VISUAL OUTPUT · CREATED NOW</p>
              <p className="mt-1 text-sm text-foreground/85">{cleanDisplayText(drawing.name)}</p>
            </div>
            <button
              type="button"
              onClick={() => download(drawing.name, drawing.content)}
              className="min-h-10 rounded-full border border-gold/50 bg-gold/10 px-4 text-xs tracking-wide text-gold"
            >
              KEEP SVG
            </button>
          </div>
          <div className="ascension-artifact-canvas relative flex min-h-[360px] items-center justify-center overflow-hidden p-4 sm:min-h-[520px] sm:p-8">
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.content)}`}
              alt={`Drawing for ${delivery.title}`}
              className="max-h-[70vh] w-full object-contain"
            />
          </div>
        </section>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-eyebrow text-primary">{drawing ? "DESIGN READOUT" : "ASCENSION RESULT"}</p>
            <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground sm:text-3xl">
              {cleanDisplayText(delivery.title)}
            </h2>
          </div>
          {source === "governed" && (
            <span className="rounded-full border border-gold/40 px-3 py-1 text-[0.65rem] tracking-[0.14em] text-gold uppercase">
              GOVERNED RESULT
            </span>
          )}
        </div>

        {body.summary && !hasVisualChoices && (
          <div className="rounded-xl border border-primary/20 bg-background/20 p-4 sm:p-5">
            <p className="whitespace-pre-wrap break-words text-base leading-7 text-foreground/95">
              {body.summary}
            </p>
          </div>
        )}

        {body.summary && hasVisualChoices && (
          <details className="rounded-xl border border-border/60 bg-void/25 px-4 py-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">Overview</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
              {body.summary}
            </p>
          </details>
        )}

        {(body.detail || body.internal) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {body.detail && (
              <details className="rounded-xl border border-border/70 bg-void/35 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground/85">
                  Full explanation
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {body.detail}
                </p>
              </details>
            )}
            {body.internal && (
              <details className="rounded-xl border border-border/70 bg-void/35 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground/85">
                  Knowledge used
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {body.internal}
                </p>
              </details>
            )}
          </div>
        )}
      </div>

      {otherFiles.map((file) => (
        <div
          key={file.name}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4"
        >
          <div>
            <p className="text-xs tracking-[0.14em] text-gold uppercase">
              {source === "external_draft" ? "CREATED FILE" : "RUNTIME FILE"}
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
        <details className="rounded-xl border border-gold/20 bg-gold/[0.03] px-4 py-3">
          <summary className="cursor-pointer text-sm text-gold">Limits / what remains</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {delivery.limitations.map((line, i) => (
              <li key={i}>{cleanDisplayText(line)}</li>
            ))}
          </ul>
        </details>
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
        Proof / verification
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
  const [access, setAccess] = useState<"guest" | "auth">("guest");
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [follow, setFollow] = useState<FollowState | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bookSequence, setBookSequence] = useState<"idle" | "roots" | "trunk" | "nodes" | "canopy" | "eruption" | "processing">("idle");
  const [bookOpen, setBookOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const sequenceTimers = useRef<number[]>([]);
  const burstRun = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("run") ?? read(ACTIVE);
    if (id && /^[a-f0-9-]{36}$/i.test(id)) {
      setActive(id);
      const storedAccess = read(ACCESS) === "auth" ? "auth" : "guest";
      setAccess(storedAccess);
      if (storedAccess === "guest") {
        const token = read(GUEST_TOKEN);
        if (token && /^[a-f0-9-]{36}$/i.test(token)) setGuestToken(token);
      }
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
    queryKey: ["ascension", "run", active, access],
    enabled: Boolean(active) && (access === "auth" || Boolean(guestToken)),
    queryFn: async () =>
      access === "guest"
        ? (
            await getGuestObjectiveStatus({
              data: { requestId: active!, guestToken: guestToken! },
            })
          ).request
        : (await getObjectiveStatus({ data: { requestId: active! } })).request,
    refetchInterval: (q) => (q.state.data && TERMINAL.has(q.state.data.status) ? false : 2500),
    retry: false,
  });

  const deliveryQuery = useQuery<DeliveryState | null>({
    queryKey: ["ascension", "delivery", active, access, runQuery.data?.status ?? null],
    placeholderData: (prev) => prev,
    enabled: Boolean(active) && (access === "auth" || Boolean(guestToken)),
    queryFn: () =>
      access === "guest"
        ? getGuestObjectiveDelivery({
            data: { requestId: active!, guestToken: guestToken! },
          })
        : getObjectiveDelivery({ data: { requestId: active! } }),
    // Keep checking briefly after verification: artifact transport can arrive
    // after the run status, and a substantive governed result supersedes a draft.
    refetchInterval: (q) => {
      if (!active) return false;
      if (q.state.data?.status !== "completed") return 2500;
      if (q.state.data?.source !== "external_draft") return false;
      const finishedAt = Date.parse(runQuery.data?.completed_at ?? "");
      return runQuery.data?.status === "verified" &&
        Number.isFinite(finishedAt) &&
        Date.now() - finishedAt < 90_000
        ? 2500
        : false;
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
      access === "guest"
        ? prepareGuestObjectiveDelivery({
            data: { requestId: id, guestToken: guestToken!, retry },
          })
        : prepareObjectiveDelivery({ data: { requestId: id, retry } }),
    onSuccess: (_data, vars) => {
      void client.invalidateQueries({ queryKey: ["ascension", "delivery", vars.id] });
    },
  });

  const run = runQuery.data;

  const engage = useMutation({
    mutationFn: async () => {
      const payload = {
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
      };

      const { data } = await supabase.auth.getUser();
      if (data.user) {
        return {
          request: (await submitObjective({ data: payload })).request,
          access: "auth" as const,
          guestToken: null,
        };
      }

      const guest = await submitGuestObjective({
        data: {
          ...payload,
          ...(follow && guestToken ? { parentGuestToken: guestToken } : {}),
        },
      });
      return {
        request: guest.request,
        access: "guest" as const,
        guestToken: guest.guestToken,
      };
    },
    onError: () => {
      // Return the Book to a usable state so the objective can be sent again.
      sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
      sequenceTimers.current = [];
      setBookSequence("idle");
      setBookOpen(Boolean(run));
      setRevealed(Boolean(run));
    },
    onSuccess: ({ request, access: nextAccess, guestToken: nextGuestToken }) => {
      setAccess(nextAccess);
      save(ACCESS, nextAccess);
      if (nextAccess === "guest" && nextGuestToken) {
        setGuestToken(nextGuestToken);
        save(GUEST_TOKEN, nextGuestToken);
      } else {
        setGuestToken(null);
        save(GUEST_TOKEN, "");
      }
      client.setQueryData(["ascension", "run", request.id, nextAccess], request);
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

      // Show the queued result area as soon as the request is accepted.
      setBookOpen(true);
      setRevealed(true);
    },
  });

  let delivery: ObjectiveDelivery | null = null;
  let invalidDelivery: string | null = null;
  let notProduced: string | null = null;
  if (deliveryQuery.data?.status === "completed" && run) {
    try {
      const parsed = parseDelivery(deliveryQuery.data.response_payload);
      // Re-check on screen too: a stale projection must never pass as a result.
      const visualSvgs = [
        ...parsed.pathways
          .map((pathway) => pathway.visual_svg)
          .filter((value): value is string => Boolean(value)),
        ...(parsed.blend?.visual_svg ? [parsed.blend.visual_svg] : []),
      ];
      const check = assessResult(run.objective, parsed.body, parsed.files, visualSvgs);
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

  useEffect(() => {
    if (!run) return;
    if (produced === true) {
      if (burstRun.current === run.id) return;
      burstRun.current = run.id;
      sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
      sequenceTimers.current = [];
      setBookOpen(true);
      setRevealed(true);
      setBookSequence("eruption");
      const scrollTimer = window.setTimeout(
        () => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        180,
      );
      const settleTimer = window.setTimeout(() => setBookSequence("idle"), 1800);
      sequenceTimers.current.push(scrollTimer, settleTimer);
      return;
    }
    if (!TERMINAL.has(run.status)) return;
    sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
    sequenceTimers.current = [];
    setBookOpen(true);
    setRevealed(true);
    setBookSequence(run.status === "verified" && produced === null ? "processing" : "idle");
  }, [run?.id, run?.status, produced]);

  const followUp = (kind: FollowUp) => {
    if (!run) return;
    setFollow({ id: run.id, kind });
    setObjective(run.objective);
    setEvidence(strings(run.evidence).join("\n"));
    setConstraints(strings(run.constraints).join("\n"));
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => inputRef.current?.focus(), 250);
  };

  const choosePathway = (pathway: ObjectiveDelivery["pathways"][number]) => {
    if (!run) return;
    const selection = JSON.stringify({
      source: "USER_SPIRAL_SELECTION",
      selection_authority: "USER_SELECTED",
      pathway: {
        id: pathway.id,
        label: pathway.label,
        spiral_form: pathway.spiral_form,
        summary: pathway.summary,
        steps: pathway.steps,
        tradeoffs: pathway.tradeoffs,
      },
      instruction: "Use this selected Spiral pathway as the direction for the next governed objective.",
    });
    setFollow({ id: run.id, kind: "refine", pathwayLabel: pathway.label });
    setObjective(run.objective);
    setEvidence([...strings(run.evidence), selection].join("\n"));
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
    setBookSequence("roots");

    const phase = (
      delay: number,
      next: "trunk" | "nodes" | "canopy" | "eruption" | "processing",
      reveal = false,
    ) => {
      const timer = window.setTimeout(() => {
        setBookSequence(next);
        if (reveal) {
          setRevealed(true);
          window.setTimeout(
            () => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
            180,
          );
        }
      }, delay);
      sequenceTimers.current.push(timer);
    };

    // The Tree is present from the start. It charges as the request moves
    // through the queue; the knowledge eruption waits for a delivered result.
    phase(900, "trunk");
    phase(1800, "nodes");
    phase(2800, "canopy");
    phase(3900, "processing");
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
              {follow.pathwayLabel
                ? `Pursuing pathway: ${follow.pathwayLabel}`
                : follow.kind === "refine"
                  ? "Refining the previous result"
                  : "Continuing the previous result"}
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
                      setAccess("auth");
                      save(ACCESS, "auth");
                      setGuestToken(null);
                      save(GUEST_TOKEN, "");
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
          className="ascension-result-reveal mx-auto max-w-6xl scroll-mt-20 space-y-4 rounded-2xl border border-primary/30 bg-void/85 p-4 shadow-2xl sm:p-6"
        >
          <div>
            <p className="label-eyebrow text-primary">ASCENSION RESPONSE</p>
            <p className="mt-2 text-sm text-muted-foreground">{run.objective}</p>
            <p role="status" className="mt-3 text-sm text-foreground/90">
              {delivery && deliveryQuery.data?.source === "external_draft"
                ? "Your result is below."
                : deliveryQuery.data?.note && produced === null
                  ? deliveryQuery.data.note
                  : statusText(run, produced)}
            </p>
          </div>

          {delivery ? (
            <>
              <AscensionSignal run={run} delivery={delivery} />
              <ResultContent delivery={delivery} source={deliveryQuery.data?.source ?? null} />
              <SpiralPathways run={run} delivery={delivery} onChoosePathway={choosePathway} />
            </>
          ) : notProduced ? (
            <div role="alert" className="rounded-xl border border-gold/35 bg-gold/5 p-5">
              <p className="whitespace-pre-wrap text-foreground">{notProduced}</p>
              {deliveryQuery.data?.error && (
                <p className="mt-3 text-sm text-foreground/85">{deliveryQuery.data.error}</p>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                A finished or verified run is not the same as your result. Nothing here is
                offered for download.
              </p>
              <button
                type="button"
                disabled={prepare.isPending}
                onClick={() => prepare.mutate({ id: run.id, retry: true })}
                className="mt-4 min-h-11 rounded-full border border-primary/40 px-5 text-sm text-primary"
              >
                {deliveryQuery.data?.error ? "RETRY DRAFT" : "CHECK FOR RESULT"}
              </button>
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
