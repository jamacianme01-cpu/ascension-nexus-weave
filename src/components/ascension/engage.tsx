import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealityViewer, type RealityMode } from "@/components/ascension/RealityViewer";
import { createRealityAtmosphere, playSpatialSwell } from "./reality-audio";
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
  hasEnvisionPreparation,
  requestedKind,
  governedPersisted,
  notProducedMessage,
  parseDelivery,
  planningFor,
  receiptFiles,
  record,
  strings,
  type ObjectiveDelivery,
} from "@/lib/ascension/result-model";
import {
  editableEvidence, parentQuestionId, pathwayBlendInput, partBlendInput,
  readSavedQuestions, rememberQuestion, readBlendSelection, saveBlendSelection,
  toggleBlendInput, revisionEvidence, pathwayVariables, variableBlendInput, type SavedQuestion, type BlendInput,
} from "@/lib/ascension/iteration-model";

const TERMINAL = new Set(["verified", "rejected", "failed"]);
const ACTIVE = "ascension.active-objective";
const DRAFT = "ascension.objective.draft";
const ACCESS = "ascension.active-access";
const GUEST_TOKEN = "ascension.active-guest-token";
const SOUND_PREF = "ascension.sound.enabled";
const BOOK_TREE_SCENE = "/approved-scene/ascension-tree-behind-book-hq.jpg";
type FollowUp = "continue" | "refine";
type FollowState = { id: string; kind: FollowUp; pathwayLabel?: string; access: "guest" | "auth"; guestToken?: string | undefined };
type SubmissionInput = {
  objective: string; evidence: string[]; constraints: string[];
  parentRequestId?: string; followUp?: FollowUp; parentGuestToken?: string | undefined;
  parentAccess?: "guest" | "auth";
};

function BlendControls({ inputs, changes, onChanges, onRemove, onCreate, disabled, error }: {
  inputs: BlendInput[]; changes: string; onChanges: (value: string) => void;
  onRemove: (key: string) => void; onCreate: () => void; disabled: boolean;
  error?: string | null;
}) {
  if (!inputs.length) return null;
  return <div className="space-y-3 rounded-xl border border-gold/35 bg-gold/5 p-3" aria-label="Selected blend inputs">
    <p className="text-sm text-gold">{inputs.length} selected for a new blend</p>
    <div className="flex flex-wrap gap-2">{inputs.map(input => <button type="button" key={input.key}
      onClick={() => onRemove(input.key)} aria-label={`Remove ${input.name} from blend`}
      className="rounded-lg border border-gold/35 px-3 py-2 text-left text-sm text-foreground">
      {input.name} <span aria-hidden="true">×</span>
    </button>)}</div>
    <label className="block text-sm text-foreground">Changes for this blend
      <textarea value={changes} onChange={event => onChanges(event.target.value)} maxLength={900} rows={2}
        placeholder="Change a variable, describe how the parts should connect, or leave as selected."
        className="mt-2 w-full rounded-lg border border-gold/30 bg-void/60 p-3" />
    </label>
    <button type="button" disabled={disabled || inputs.length < 2} onClick={onCreate}
      className="min-h-11 rounded-full border border-gold/50 px-5 text-sm text-gold disabled:opacity-40">
      CREATE NEW BLEND
    </button>
    {error && <p role="alert" className="text-sm text-gold">{error}</p>}
  </div>;
}

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

type AscensionSoundCue =
  | "engage"
  | "roots"
  | "trunk"
  | "nodes"
  | "canopy"
  | "processing"
  | "eruption"
  | "possibility"
  | "condensation"
  | "reveal"
  | "stabilize"
  | "select"
  | "blend"
  | "open";

function audioContextFor(ref: { current: AudioContext | null }) {
  if (typeof window === "undefined") return null;
  if (ref.current) return ref.current;
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  ref.current = new AudioContextCtor();
  return ref.current;
}

function playAscensionSound(ref: { current: AudioContext | null }, cue: AscensionSoundCue) {
  const ctx = audioContextFor(ref);
  if (!ctx) return;
  void ctx.resume().catch(() => {});
  // Broad, low, breathing textures; no melodic UI chimes.
  if (["engage", "eruption", "open"].includes(cue))
    playSpatialSwell(ctx, cue === "open" ? 1 : 0.45);
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

function splitResultBody(value: string) {
  const cleaned = cleanDisplayText(value);
  const marker = "General-knowledge explanation:";
  const markerIndex = cleaned.indexOf(marker);
  const internal = markerIndex >= 0 ? cleaned.slice(0, markerIndex).trim() : "";
  const main = markerIndex >= 0 ? cleaned.slice(markerIndex + marker.length).trim() : cleaned;

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
  // A BLEND is synthesis, not another Spiral pathway. Never inflate the
  // pathway count by counting BLEND as a path.
  const deliveredPathCount = delivery.pathways.length;
  const pathCount = deliveredPathCount || planning.branches.length;
  const spiralSignal = pathCount
    ? `${pathCount} PATH${pathCount === 1 ? "" : "S"}${delivery.blend ? " + BLEND" : ""}`
    : delivery.blend
      ? "BLEND"
      : "ACTIVE";
  const guardian = run.guardian_verdict ?? "—";
  const autosync = String(result["autosync_verdict"] ?? "—");
  const delta = governedPersisted(run)
    ? `K+${String(result["delta_k"] ?? 0)} · W+${String(result["delta_w"] ?? 0)} · U+${String(result["delta_u"] ?? 0)}`
    : "PENDING";

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        ["SPIRAL", spiralSignal],
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

function SelectedRealityDetails({
  delivery,
  selectedId,
  onUse,
}: {
  delivery: ObjectiveDelivery;
  selectedId: string;
  onUse: (pathway: ObjectiveDelivery["pathways"][number]) => void;
}) {
  const choices = delivery.blend ? [...delivery.pathways, delivery.blend] : delivery.pathways;
  const selected = choices.find((choice) => choice.id === selectedId) ?? null;
  if (!selected) return null;
  const isBlend = delivery.blend?.id === selected.id;

  return (
    <section
      className={
        isBlend
          ? "overflow-hidden rounded-2xl border border-gold/45 bg-gold/[0.04]"
          : "overflow-hidden rounded-2xl border border-primary/35 bg-primary/[0.03]"
      }
    >
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={isBlend ? "label-eyebrow text-gold" : "label-eyebrow text-primary"}>
              {isBlend ? "BLEND REALITY" : "SELECTED REALITY"}
            </p>
            <h2 className="mt-1 font-display text-2xl text-foreground sm:text-3xl">
              {cleanDisplayText(selected.label)}
            </h2>
          </div>
          {selected.outcome_score !== null && (
            <div className="rounded-full border border-primary/25 px-3 py-1 text-sm text-primary">
              Outcome {Math.round(selected.outcome_score * 100)}%
            </div>
          )}
        </div>

        <p className="text-base leading-7 text-foreground/92">
          {cleanDisplayText(selected.summary)}
        </p>

        {isBlend && delivery.blend?.blend_reason && (
          <div className="rounded-xl border border-gold/25 bg-gold/[0.04] p-4">
            <p className="text-xs font-medium tracking-[0.14em] text-gold uppercase">
              Why ASCENSION blended it
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground/88">
              {cleanDisplayText(delivery.blend.blend_reason)}
            </p>
          </div>
        )}

        {selected.outcome_reason && (
          <div className="rounded-xl border border-primary/20 p-4">
            <p className="text-xs font-medium tracking-[0.14em] text-primary uppercase">
              Outcome Predictor
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {cleanDisplayText(selected.outcome_reason)}
            </p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {selected.steps.length > 0 && (
            <div>
              <p className="text-xs font-medium tracking-[0.12em] text-foreground/75 uppercase">
                Path steps
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-foreground/90">
                {selected.steps.map((step, index) => (
                  <li key={index}>{cleanDisplayText(step)}</li>
                ))}
              </ol>
            </div>
          )}

          {selected.tradeoffs.length > 0 && (
            <div>
              <p className="text-xs font-medium tracking-[0.12em] text-foreground/75 uppercase">
                Tradeoffs
              </p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                {selected.tradeoffs.map((tradeoff, index) => (
                  <li key={index}>{cleanDisplayText(tradeoff)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onUse(selected)}
          className={
            isBlend
              ? "min-h-12 rounded-full border border-gold/55 bg-gold/10 px-6 text-sm font-medium tracking-[0.1em] text-gold"
              : "min-h-12 rounded-full border border-primary/50 bg-primary/10 px-6 text-sm font-medium tracking-[0.1em] text-primary"
          }
        >
          USE THIS PATH
        </button>
      </div>
    </section>
  );
}

function download(name: string, content: string) {
  const mime = /\.svg$/i.test(name)
    ? "image/svg+xml"
    : /\.html?$/i.test(name)
      ? "text/html"
      : "text/plain";
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function statusText(run: ObjectiveRun, produced: boolean | null) {
  if (run.status === "queued") return "Objective received. Waiting for ASCENSION runtime.";
  if (run.status === "claimed" || run.status === "running")
    return "ASCENSION is processing your objective.";
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

export function ResultContent({
  delivery,
  source,
  onInspect,
  canInspect = false,
  selectedBlendIds = [],
  onToggleBlend,
  selectedVariableKeys = [],
  onToggleVariable,
  variableKey,
}: {
  delivery: ObjectiveDelivery;
  source?: "governed" | "external_draft" | null;
  onInspect?: (pathway: ObjectiveDelivery["pathways"][number]) => void;
  canInspect?: boolean;
  selectedBlendIds?: string[];
  onToggleBlend?: (pathway: ObjectiveDelivery["pathways"][number]) => void;
  selectedVariableKeys?: string[];
  onToggleVariable?: (pathway: ObjectiveDelivery["pathways"][number], variable: ReturnType<typeof pathwayVariables>[number]) => void;
  variableKey?: (pathway: ObjectiveDelivery["pathways"][number], variable: ReturnType<typeof pathwayVariables>[number]) => string;
}) {
  const hasVisualChoices = delivery.pathways.length > 0 || Boolean(delivery.blend);
  // ENVISION's interactive 3D scene is the primary visual whenever pathways exist.
  // Keep legacy SVG artifacts out of the main presentation so the experience
  // cannot fall back to a flat drawing after a holographic reality is selected.
  const drawing = hasVisualChoices
    ? undefined
    : delivery.files.find((file) => /\.svg$/i.test(file.name));
  const body = splitResultBody(delivery.body);
  const otherFiles = delivery.files.filter(
    (file) => file !== drawing && !(/\.svg$/i.test(file.name) && hasVisualChoices),
  );
  const variablesFor = (pathway: ObjectiveDelivery["pathways"][number]) => onToggleVariable && variableKey && (
    <details className="ascension-variable-picker mt-3" onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm text-gold">Choose variables to blend</summary>
      <div className="space-y-2" role="group" aria-label={`Variables from ${pathway.label}`}>
        {pathwayVariables(pathway).map(variable => {
          const key = variableKey(pathway, variable);
          return <label key={key} className="flex min-h-11 items-start gap-3 rounded-lg border border-gold/20 p-3 text-sm">
            <input type="checkbox" className="mt-1 shrink-0" checked={selectedVariableKeys.includes(key)}
              onChange={() => onToggleVariable(pathway, variable)}
              aria-label={`Use ${variable.name} from ${pathway.label} in a new blend`} />
            <span className="min-w-0 break-words"><strong className="block text-gold">{variable.name}</strong>
              {cleanDisplayText(variable.description)}</span>
          </label>;
        })}
      </div>
    </details>
  );

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

      {!canInspect && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label-eyebrow text-primary">
                {drawing ? "DESIGN READOUT" : "ASCENSION RESULT"}
              </p>
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
      )}

      {(delivery.pathways.length > 0 || delivery.blend) && (
        <section className="ascension-pathway-cards space-y-3 rounded-2xl border border-primary/25 bg-primary/[0.025] p-4 sm:p-5">
          <div>
            <p className="label-eyebrow text-primary">SPIRAL PATHWAYS</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {delivery.pathways.length} distinct path{delivery.pathways.length === 1 ? "" : "s"}
              {delivery.blend ? " + BLEND" : ""}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {delivery.pathways.map((pathway, index) => (
              <article
                key={pathway.id}
                onClick={canInspect && onInspect ? () => onInspect(pathway) : undefined}
                className={`rounded-xl border border-primary/25 bg-background/25 p-4 ${canInspect ? "cursor-pointer transition hover:border-primary/60 hover:bg-primary/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/45" : ""}`}
              >
                {onToggleBlend && <label className="mb-3 flex min-h-11 items-center gap-2 text-sm text-gold"
                  onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                  <input type="checkbox" checked={selectedBlendIds.includes(pathway.id)}
                    onChange={() => onToggleBlend(pathway)} aria-label={`Use ${pathway.label} in a new blend`} />
                  Choose for blending
                </label>}
                <p className="text-[0.65rem] tracking-[0.16em] text-primary uppercase">
                  PATH {index + 1}
                  {pathway.spiral_form ? ` · ${cleanDisplayText(pathway.spiral_form)}` : ""}
                </p>
                <h3 className="mt-1 font-display text-xl text-foreground">
                  {cleanDisplayText(pathway.label)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-foreground/90">
                  {cleanDisplayText(pathway.summary)}
                </p>
                {pathway.steps.length > 0 && (
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-foreground/85">
                    {pathway.steps.map((step, stepIndex) => (
                      <li key={stepIndex}>{cleanDisplayText(step)}</li>
                    ))}
                  </ol>
                )}
                {pathway.tradeoffs.length > 0 && (
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Tradeoffs: {pathway.tradeoffs.map(cleanDisplayText).join(" · ")}
                  </p>
                )}
                {variablesFor(pathway)}
                {canInspect && (
                  <button type="button" onClick={event => { event.stopPropagation(); onInspect?.(pathway); }}
                    className="mt-4 min-h-11 text-left text-xs font-medium tracking-[0.14em] text-primary uppercase">
                    {pathway.model_url ? "DIVE INTO REALITY" : "DIVE INTO REALITY · CONCEPT / UNVERIFIED"}
                  </button>
                )}
              </article>
            ))}

            {delivery.blend && (
              <article
                onClick={canInspect && onInspect ? () => onInspect(delivery.blend!) : undefined}
                className={`rounded-xl border border-gold/40 bg-gold/[0.04] p-4 ${canInspect ? "cursor-pointer transition hover:border-gold/70 hover:bg-gold/[0.08] focus:outline-none focus:ring-2 focus:ring-gold/45" : ""}`}
              >
                {onToggleBlend && <label className="mb-3 flex min-h-11 items-center gap-2 text-sm text-gold"
                  onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                  <input type="checkbox" checked={selectedBlendIds.includes(delivery.blend.id)}
                    onChange={() => onToggleBlend(delivery.blend!)} aria-label={`Use ${delivery.blend.label} in a new blend`} />
                  Choose for blending
                </label>}
                <p className="text-[0.65rem] tracking-[0.16em] text-gold uppercase">BLEND</p>
                <h3 className="mt-1 font-display text-xl text-foreground">
                  {cleanDisplayText(delivery.blend.label)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-foreground/90">
                  {cleanDisplayText(delivery.blend.summary)}
                </p>
                {delivery.blend.steps.length > 0 && (
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-foreground/85">
                    {delivery.blend.steps.map((step, stepIndex) => (
                      <li key={stepIndex}>{cleanDisplayText(step)}</li>
                    ))}
                  </ol>
                )}
                {delivery.blend.blend_reason && (
                  <p className="mt-3 text-xs leading-5 text-gold/85">
                    Why blended: {cleanDisplayText(delivery.blend.blend_reason)}
                  </p>
                )}
                {variablesFor(delivery.blend)}
                {canInspect && (
                  <button type="button" onClick={event => { event.stopPropagation(); onInspect?.(delivery.blend!); }}
                    className="mt-4 min-h-11 text-left text-xs font-medium tracking-[0.14em] text-gold uppercase">
                    {delivery.blend.model_url ? "DIVE INTO BLENDED REALITY" : "DIVE INTO BLENDED REALITY · CONCEPT / UNVERIFIED"}
                  </button>
                )}
              </article>
            )}
          </div>
        </section>
      )}

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
  const [savedQuestions, setSavedQuestions] = useState<SavedQuestion[]>([]);
  const [blendInputs, setBlendInputs] = useState<BlendInput[]>([]);
  const [blendChanges, setBlendChanges] = useState("");
  const [iterationError, setIterationError] = useState<string | null>(null);
  const reopenedQuestion = useRef<string | null>(null);
  const [bookSequence, setBookSequence] = useState<
    "idle" | "roots" | "trunk" | "nodes" | "canopy" | "eruption" | "processing"
  >("idle");
  const [bookOpen, setBookOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [treeChoiceId, setTreeChoiceId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reality, setReality] = useState<{ id: string; mode: RealityMode } | null>(null);
  const autoDrawingRun = useRef<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const atmosphere = useRef<ReturnType<typeof createRealityAtmosphere> | null>(null);
  const sequenceTimers = useRef<number[]>([]);
  const burstRun = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const saved = readSavedQuestions();
    setSavedQuestions(saved);
    setBlendInputs(readBlendSelection());
    // A normal visit must always open on a fresh command surface.
    // Resume a previous run only when the URL explicitly names that run
    // (for example, after the user selects Past results or follows a saved run link).
    const id = new URL(window.location.href).searchParams.get("run");
    if (id && /^[a-f0-9-]{36}$/i.test(id)) {
      setActive(id);
      reopenedQuestion.current = id;
      const entry = saved.find(item => item.id === id);
      const storedAccess = entry?.access ?? (read(ACCESS) === "auth" ? "auth" : "guest");
      setAccess(storedAccess);
      if (storedAccess === "guest") {
        const token = entry?.guestToken ?? (read(ACTIVE) === id ? read(GUEST_TOKEN) : null);
        if (token && /^[a-f0-9-]{36}$/i.test(token)) setGuestToken(token);
      }
      setFollow({ id, kind: "refine", access: storedAccess,
        guestToken: entry?.guestToken ?? (read(ACTIVE) === id ? read(GUEST_TOKEN) ?? undefined : undefined) });
      setBookOpen(true);
      setRevealed(true);
    } else {
      setActive(null);
      setBookOpen(false);
      setRevealed(false);
      setBookSequence("idle");
      setTreeChoiceId(null);
      setDetailsOpen(false);
    }
    const draft = read(DRAFT);
    if (draft) setObjective(draft);
    const storedSound = read(SOUND_PREF);
    if (storedSound === "off") setSoundEnabled(false);
  }, []);

  useEffect(
    () => () => {
      sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
      atmosphere.current?.stop();
      const context = audioContextRef.current;
      if (context && context.state !== "closed") void context.close();
    },
    [],
  );

  useEffect(() => {
    const syncAudio = () => {
      const ctx = audioContextRef.current;
      if (!ctx || ctx.state === "closed") return;
      if (document.hidden || !soundEnabled) void ctx.suspend().catch(() => {});
      else void ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", syncAudio);
    return () => document.removeEventListener("visibilitychange", syncAudio);
  }, [soundEnabled]);

  const sound = (cue: AscensionSoundCue) => {
    if (!soundEnabled || document.hidden) return;
    playAscensionSound(audioContextRef, cue);
  };

  const [soundBlocked, setSoundBlocked] = useState(false);
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    save(SOUND_PREF, next ? "on" : "off");
    if (next) {
      // Runs inside the click gesture: resume, then rebuild a fresh graph.
      const ctx = audioContextFor(audioContextRef);
      if (!ctx) { setSoundBlocked(true); return; }
      atmosphere.current?.stop();
      atmosphere.current = reality ? createRealityAtmosphere(ctx) : null;
      void ctx.resume().then(() => setSoundBlocked(ctx.state !== "running")).catch(() => setSoundBlocked(true));
    } else {
      atmosphere.current?.stop();
      atmosphere.current = null;
      setSoundBlocked(false);
      if (audioContextRef.current?.state === "running") void audioContextRef.current.suspend();
    }
  };

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
    placeholderData: (prev, previousQuery) =>
      previousQuery?.queryKey[2] === active && previousQuery?.queryKey[3] === access
        ? prev
        : undefined,
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
      const delivery = q.state.data;
      if (delivery?.status !== "completed") return 2500;

      const modelChoices = delivery.response_payload
        ? delivery.response_payload.blend
          ? [...delivery.response_payload.pathways, delivery.response_payload.blend]
          : delivery.response_payload.pathways
        : [];
      const waitingForHunyuan = modelChoices.some((pathway) =>
        ["queued", "claimed", "running"].includes(pathway.model_status ?? ""),
      );
      if (waitingForHunyuan) return 3000;

      if (delivery.source !== "external_draft") return false;
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
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ? listMyObjectives() : { items: [] };
    },
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
  useEffect(() => {
    if (!run || (access === "guest" && !guestToken)) return;
    setSavedQuestions(rememberQuestion({ id: run.id, objective: run.objective, created_at: run.created_at,
      access, ...(guestToken ? { guestToken } : {}), parentId: parentQuestionId(run.evidence) }));
    if (reopenedQuestion.current === run.id) {
      reopenedQuestion.current = null;
      setObjective(run.objective);
      setEvidence(editableEvidence(run.evidence).join("\n"));
      setConstraints(strings(run.constraints).join("\n"));
    }
  }, [run?.id, run?.objective, access, guestToken]);
  const pastQuestions = useMemo(() => {
    const items = new Map<string, SavedQuestion>();
    for (const item of history.data?.items ?? []) items.set(item.id, { id: item.id, objective: item.objective,
      created_at: item.created_at, access: "auth", parentId: parentQuestionId(item.evidence) });
    for (const item of savedQuestions) items.set(item.id, item);
    return [...items.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [history.data, savedQuestions]);

  const engage = useMutation({
    mutationFn: async (input: SubmissionInput) => {
      const { parentAccess, parentGuestToken, ...payload } = input;

      const { data } = await supabase.auth.getUser();
      if (parentAccess === "auth" || (data.user && !parentGuestToken)) {
        return {
          request: (await submitObjective({ data: payload })).request,
          access: "auth" as const,
          guestToken: null,
        };
      }

      const guest = await submitGuestObjective({
        data: {
          ...payload,
          ...(parentGuestToken ? { parentGuestToken } : {}),
        },
      });
      return {
        request: guest.request,
        access: "guest" as const,
        guestToken: guest.guestToken,
      };
    },
    onError: (_error, input) => {
      // Return the Book to a usable state so the objective can be sent again.
      sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
      sequenceTimers.current = [];
      setBookSequence("idle");
      setObjective(input.objective);
      setEvidence(editableEvidence(input.evidence).join("\n"));
      setConstraints(input.constraints.join("\n"));
      if (input.parentRequestId) {
        setActive(input.parentRequestId);
        autoDrawingRun.current = input.parentRequestId;
        setFollow({ id: input.parentRequestId, kind: input.followUp ?? "refine",
          access: input.parentAccess ?? "guest", guestToken: input.parentGuestToken });
      }
      setBookOpen(Boolean(input.parentRequestId));
      setRevealed(Boolean(input.parentRequestId));
    },
    onSuccess: async ({ request, access: nextAccess, guestToken: nextGuestToken }, input) => {
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
      setSavedQuestions(rememberQuestion({ id: request.id, objective: request.objective, created_at: request.created_at,
        access: nextAccess, ...(nextGuestToken ? { guestToken: nextGuestToken } : {}), parentId: input.parentRequestId }));
      setActive(request.id);
      save(ACTIVE, request.id);
      save(DRAFT, "");
      setObjective("");
      setEvidence("");
      setConstraints("");
      setFollow(null);
      setTreeChoiceId(null);
      setDetailsOpen(true);
      prepare.reset();
      void client.invalidateQueries({ queryKey: ["ascension", "my-objectives"] });
      window.history.replaceState(null, "", `/?run=${encodeURIComponent(request.id)}`);

      // ENGAGE must produce the hosted user-facing result immediately.
      // Governed execution remains independent and may supersede this draft later.
      setBookOpen(true);
      setRevealed(true);
      setBookSequence("processing");
      try {
        const immediateDelivery =
          nextAccess === "guest" && nextGuestToken
            ? await prepareGuestObjectiveDelivery({
                data: {
                  requestId: request.id,
                  guestToken: nextGuestToken,
                  retry: false,
                },
              })
            : await prepareObjectiveDelivery({
                data: { requestId: request.id, retry: false },
              });
        client.setQueryData(
          ["ascension", "delivery", request.id, nextAccess, request.status],
          immediateDelivery,
        );
      } catch (cause) {
        setIterationError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        void client.invalidateQueries({
          queryKey: ["ascension", "delivery", request.id],
        });
      }
    },
  });

  // Parse once per fetch, not once per render: the ENVISION scene depends on
  // this object staying referentially stable so its WebGL state and
  // manifestation clocks survive unrelated re-renders.
  const { delivery, invalidDelivery, notProduced } = useMemo(() => {
    let parsedDelivery: ObjectiveDelivery | null = null;
    let parseError: string | null = null;
    let unproduced: string | null = null;
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
        if (parsed.kind === "not_produced" || (!check.produced && !hasEnvisionPreparation(run.objective, parsed))) {
          unproduced =
            parsed.kind === "not_produced"
              ? parsed.body
              : `${notProducedMessage(check.kind)} What came back${check.reason ? ` — ${check.reason}` : ""} — is not the result you asked for.`;
        } else {
          parsedDelivery = { ...parsed, files: check.files };
        }
      } catch (cause) {
        parseError = cause instanceof Error ? cause.message : String(cause);
      }
    }
    return { delivery: parsedDelivery, invalidDelivery: parseError, notProduced: unproduced };
  }, [deliveryQuery.data, run]);
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

      // The detailed pathway cards are the single entry into visual realities.
      setDetailsOpen(true);

      // The tree is the result event. Hold the eruption state instead of
      // treating it as a short transition into a separate scrolling page.
      setBookSequence("eruption");
      sound("eruption");
      window.setTimeout(
        () => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        120,
      );
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
    closeReality();
    setFollow({ id: run.id, kind, access, ...(guestToken ? { guestToken } : {}) });
    setObjective(run.objective);
    setEvidence(editableEvidence(run.evidence).join("\n"));
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
      instruction:
        "Use this selected Spiral pathway as the direction for the next governed objective.",
    });
    setFollow({ id: run.id, kind: "refine", pathwayLabel: pathway.label, access, ...(guestToken ? { guestToken } : {}) });
    setObjective(run.objective);
    setEvidence([...editableEvidence(run.evidence), selection].join("\n"));
    setConstraints(strings(run.constraints).join("\n"));
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => inputRef.current?.focus(), 250);
  };

  const openTreeReality = (
    pathway: ObjectiveDelivery["pathways"][number],
    mode: RealityMode = "cutaway",
  ) => {
    const ctx = audioContextFor(audioContextRef);
    if (ctx && soundEnabled) {
      void ctx.resume().then(() => setSoundBlocked(ctx.state !== "running")).catch(() => setSoundBlocked(true));
      atmosphere.current?.stop();
      atmosphere.current = createRealityAtmosphere(ctx);
    }
    setTreeChoiceId(pathway.id);
    setReality({ id: pathway.id, mode });
  };

  const inspectPathwayReality = (pathway: ObjectiveDelivery["pathways"][number]) => {
    openTreeReality(pathway);
  };

  // A drawing request opens its real generated output as soon as it arrives.
  // Closing or choosing a pathway remains the user's decision; never reopen it.
  useEffect(() => {
    if (!run || !delivery || requestedKind(run.objective) !== "drawing" ||
      autoDrawingRun.current === run.id) return;
    if (reality) {
      autoDrawingRun.current = run.id;
      return;
    }
    const generated = [...delivery.pathways, ...(delivery.blend ? [delivery.blend] : [])]
      .find((pathway) => Boolean(pathway.model_url));
    if (!generated) return;
    autoDrawingRun.current = run.id;
    setTreeChoiceId(generated.id);
    setReality({ id: generated.id, mode: "blueprint" });
  }, [run?.id, run?.objective, delivery, reality]);

  const error = iterationError ?? engage.error ?? runQuery.error ?? deliveryQuery.error ?? prepare.error;
  const canEngage = Boolean(objective.trim()) && !engage.isPending;
  const sendSubmission = (payload: SubmissionInput) => {
    if (!payload.objective.trim() || engage.isPending) return;
    setIterationError(null);
    closeReality();
    setActive(null);
    setTreeChoiceId(null);
    sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
    sequenceTimers.current = [];
    setBookOpen(true);
    setRevealed(false);
    sound("engage");
    setBookSequence("roots");
    sound("roots");

    const phase = (
      delay: number,
      next: "trunk" | "nodes" | "canopy" | "eruption" | "processing",
      reveal = false,
    ) => {
      const timer = window.setTimeout(() => {
        setBookSequence(next);
        sound(next);
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
    engage.mutate(payload);
  };
  const startBookSequence = () => {
    if (!canEngage) return;
    sendSubmission({ objective: objective.trim(),
      evidence: evidence.split("\n").map(value => value.trim()).filter(Boolean),
      constraints: constraints.split("\n").map(value => value.trim()).filter(Boolean),
      ...(follow ? { parentRequestId: follow.id, followUp: follow.kind,
        parentAccess: follow.access, parentGuestToken: follow.guestToken } : {}) });
  };
  const newRevision = (kind: "new_answers" | "blend") => {
    if (!run || !delivery || engage.isPending) return;
    try {
      const revision = revisionEvidence(kind, kind === "blend" ? blendInputs : [], kind === "blend" ? blendChanges : "");
      const sources = editableEvidence(run.evidence);
      if (revision.length + sources.length > 32)
        throw new Error("This revision has too many selected details or source entries. Choose fewer inputs.");
      sendSubmission({ objective: run.objective, evidence: [...revision, ...sources],
        constraints: strings(run.constraints), parentRequestId: run.id, followUp: "refine",
        parentAccess: access, ...(guestToken ? { parentGuestToken: guestToken } : {}) });
    } catch (cause) { setIterationError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const updateBlend = (input: BlendInput) => {
    setBlendInputs(prior => { const next = toggleBlendInput(prior, input); saveBlendSelection(next); return next; });
  };
  const removeBlend = (key: string) => {
    setBlendInputs(prior => { const next = prior.filter(item => item.key !== key); saveBlendSelection(next); return next; });
  };
  const openQuestion = (item: SavedQuestion) => {
    if (engage.isPending) return;
    closeReality();
    sequenceTimers.current.forEach(timer => window.clearTimeout(timer));
    sequenceTimers.current = [];
    const loaded = client.getQueryData<ObjectiveRun>(["ascension", "run", item.id, item.access]);
    reopenedQuestion.current = loaded ? null : item.id;
    autoDrawingRun.current = item.id;
    setAccess(item.access); save(ACCESS, item.access);
    setGuestToken(item.guestToken ?? null); save(GUEST_TOKEN, item.guestToken ?? "");
    setActive(item.id); save(ACTIVE, item.id);
    setObjective(item.objective);
    setEvidence(loaded ? editableEvidence(loaded.evidence).join("\n") : "");
    setConstraints(loaded ? strings(loaded.constraints).join("\n") : "");
    setFollow({ id: item.id, kind: "refine", access: item.access, guestToken: item.guestToken });
    setBookOpen(true); setRevealed(true); setDetailsOpen(true); setBookSequence("idle");
    setTreeChoiceId(null); setHistoryOpen(false); setIterationError(null); engage.reset(); prepare.reset();
    window.history.replaceState(null, "", `/?run=${encodeURIComponent(item.id)}`);
    window.requestAnimationFrame(() => inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const deliveryError = deliveryQuery.data?.error ?? invalidDelivery;
  const closeReality = () => {
    atmosphere.current?.stop();
    atmosphere.current = null;
    setReality(null);
  };
  const newObjective = () => {
    if (engage.isPending) return;
    closeReality();
    sequenceTimers.current.forEach((timer) => window.clearTimeout(timer));
    sequenceTimers.current = [];
    setActive(null);
    setObjective("");
    setEvidence("");
    setConstraints("");
    setFollow(null);
    setIterationError(null);
    setTreeChoiceId(null);
    setDetailsOpen(false);
    setBookSequence("idle");
    setBookOpen(false);
    setRevealed(false);
    engage.reset();
    prepare.reset();
    save(ACTIVE, "");
    save(DRAFT, "");
    window.history.replaceState(null, "", "/");
    window.requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      inputRef.current?.focus({ preventScroll: true });
    });
  };
  // Reality editing belongs to the pathway layer itself. Every delivered
  // reality gets the same editor, regardless of the wording of the objective.
  const immersiveChoices = Boolean(delivery && run && (delivery.pathways.length || delivery.blend));
  const realityPathway =
    reality && delivery
      ? [...delivery.pathways, ...(delivery.blend ? [delivery.blend] : [])].find(
          (pathway) => pathway.id === reality.id,
        )
      : null;
  const blendControls = <BlendControls inputs={blendInputs} changes={blendChanges} onChanges={setBlendChanges}
    onRemove={removeBlend} onCreate={() => newRevision("blend")} disabled={engage.isPending || !delivery}
    error={iterationError} />;

  return (
    <div
      className="ascension-world relative isolate mx-auto w-full max-w-none"
      data-book-sequence={bookSequence === "idle" ? undefined : bookSequence}
      data-book-open={bookOpen ? "true" : undefined}
      data-has-run={run && revealed ? "true" : undefined}
      data-realities={immersiveChoices && revealed ? "true" : undefined}
    >
      {reality && realityPathway && (
        <RealityViewer
          pathway={realityPathway}
          objective={run?.objective ?? objective}
          initialMode={reality.mode}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          soundBlocked={soundBlocked}
          onDive={() => sound("open")}
          onClose={closeReality}
          onNewObjective={newObjective}
          newObjectiveDisabled={engage.isPending}
          onBuildOn={() => followUp("refine")}
          onNewAnswers={() => newRevision("new_answers")}
          isPartSelected={(part, field) => Boolean(run && blendInputs.some(item => item.key ===
            partBlendInput(run.id, run.objective, realityPathway, part, field).key))}
          onTogglePart={(part, field) => {
            if (run) updateBlend(partBlendInput(run.id, run.objective, realityPathway, part, field));
          }}
          blendControls={blendControls}
        />
      )}
      <section aria-label="Engage ASCENSION" className="ascension-command">
        <div className="ascension-stage">
          <div className="ascension-scene-hero" aria-hidden="true">
            <img className="ascension-tree-scene" src={BOOK_TREE_SCENE} alt="" draggable={false} />
          </div>

          <button
            type="button"
            className="ascension-sound-toggle"
            aria-pressed={soundEnabled}
            onClick={toggleSound}
          >
            {soundEnabled ? (soundBlocked ? "SOUND BLOCKED · TAP" : "SOUND ON") : "SOUND OFF"}
          </button>

          <label
            htmlFor="objective"
            className="relative z-[30] block text-center font-display text-lg tracking-wide text-foreground/95"
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
            onChange={(event) => { reopenedQuestion.current = null; setObjective(event.target.value); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && canEngage) {
                event.preventDefault();
                startBookSequence();
              }
            }}
            rows={5}
            maxLength={4000}
            disabled={engage.isPending}
            className="relative z-[30] w-full resize-y rounded-xl border border-gold/30 bg-void/85 px-5 py-4 text-base leading-relaxed focus:border-gold/60 focus:outline-none"
          />

          <details className="relative z-[30] rounded-xl border border-border/60 bg-void/70 px-4 py-3 text-sm text-muted-foreground">
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

          <nav className="ascension-question-tools" aria-label="Question history and new objectives">
            {active && (
              <button type="button" onClick={newObjective} disabled={engage.isPending}
                className="min-h-11 text-sm text-gold disabled:opacity-40">
                NEW OBJECTIVE
              </button>
            )}
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="min-h-11 text-sm text-muted-foreground"
            >
              {historyOpen ? "Close past results" : "Past results"}
            </button>
          </nav>
          <div className="relative z-[30] flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={!canEngage}
              onClick={startBookSequence}
              className="min-h-12 rounded-full border border-gold/55 bg-gold/10 px-7 text-sm font-medium tracking-[0.14em] text-gold disabled:opacity-40"
            >
              {engage.isPending
                ? "ENGAGING ASCENSION…"
                : "ENGAGE ASCENSION"}
            </button>
          </div>

          {historyOpen && (
            <section className="ascension-history rounded-xl border border-border p-4" aria-label="Saved questions">
              {pastQuestions.length ? (
                pastQuestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={engage.isPending}
                    onClick={() => openQuestion(item)}
                    className="block w-full border-b border-border/50 py-3 text-left text-sm text-foreground"
                  >
                    {item.objective.slice(0, 180)}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()} · {item.parentId ? "REVISION" : "ORIGINAL"} · OPEN QUESTION & RESULT
                    </span>
                  </button>
                ))
              ) : history.isPending ? (
                <p className="text-sm text-muted-foreground">Loading past results…</p>
              ) : (
                <p className="text-sm text-muted-foreground">No saved results yet.</p>
              )}
              {history.error && <p className="mt-3 text-sm text-gold">Account history could not be loaded. Saved questions from this browser are shown.</p>}
            </section>
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

      {run && revealed && (detailsOpen || !delivery) && (
        <section
          ref={answerRef}
          aria-label="Your answer"
          className="ascension-result-reveal mx-auto max-w-6xl scroll-mt-20 space-y-4 rounded-2xl border border-primary/30 bg-void/85 p-4 shadow-2xl sm:p-6"
        >
          {delivery && <div className="flex flex-wrap items-center gap-2" aria-label="Work from this result">
            <p className="w-full text-sm text-muted-foreground">{run.objective}</p>
            <button type="button" disabled={engage.isPending} onClick={() => followUp("refine")}
              className="min-h-11 rounded-full border border-gold/40 px-5 text-sm text-gold">BUILD ON RESULT</button>
            <button type="button" disabled={engage.isPending} onClick={() => newRevision("new_answers")}
              className="min-h-11 rounded-full border border-primary/40 px-5 text-sm text-primary">NEW ANSWERS</button>
            {parentQuestionId(run.evidence) && pastQuestions.find(item => item.id === parentQuestionId(run.evidence)) &&
              <button type="button" disabled={engage.isPending}
                onClick={() => openQuestion(pastQuestions.find(item => item.id === parentQuestionId(run.evidence))!)}
                className="min-h-11 px-3 text-sm text-muted-foreground">EARLIER RESULT</button>}
          </div>}
          {!immersiveChoices && (
            <div>
              <p className="label-eyebrow text-primary">ASCENSION RESPONSE</p>
              <p className="mt-2 text-sm text-muted-foreground">{run.objective}</p>
              <p role="status" className="mt-3 text-sm text-foreground/90">
                {deliveryError
                  ? "Answer generation needs attention."
                  : delivery && deliveryQuery.data?.source === "external_draft"
                    ? hasEnvisionPreparation(run!.objective, delivery) && !delivery.pathways.some((pathway) => pathway.model_url)
                      ? "Your design is ready. The 3D visual is still pending."
                      : "Your result is below."
                    : deliveryQuery.data?.note && produced === null
                      ? deliveryQuery.data.note
                      : statusText(run, produced)}
              </p>
            </div>
          )}

          {delivery ? (
            <>
              {!immersiveChoices && <AscensionSignal run={run} delivery={delivery} />}
              {!immersiveChoices && treeChoiceId && (
                <SelectedRealityDetails
                  delivery={delivery}
                  selectedId={treeChoiceId}
                  onUse={choosePathway}
                />
              )}
              <ResultContent
                delivery={delivery}
                source={deliveryQuery.data?.source ?? null}
                canInspect={immersiveChoices}
                onInspect={inspectPathwayReality}
                selectedBlendIds={blendInputs.filter(item => item.requestId === run.id && item.kind === "pathway").map(item => item.pathwayId)}
                onToggleBlend={pathway => updateBlend(pathwayBlendInput(run.id, run.objective, pathway))}
                selectedVariableKeys={blendInputs.filter(item => item.requestId === run.id && item.kind === "variable").map(item => item.key)}
                variableKey={(pathway, variable) => variableBlendInput(run.id, run.objective, pathway, variable).key}
                onToggleVariable={(pathway, variable) => updateBlend(variableBlendInput(run.id, run.objective, pathway, variable))}
              />
              {blendControls}
            </>
          ) : notProduced ? (
            <div role="alert" className="rounded-xl border border-gold/35 bg-gold/5 p-5">
              <p className="whitespace-pre-wrap text-foreground">{notProduced}</p>
              {deliveryQuery.data?.error && (
                <p className="mt-3 text-sm text-foreground/85">{deliveryQuery.data.error}</p>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                A finished or verified run is not the same as your result. Nothing here is offered
                for download.
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

          {!delivery && TERMINAL.has(run.status) && (
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


