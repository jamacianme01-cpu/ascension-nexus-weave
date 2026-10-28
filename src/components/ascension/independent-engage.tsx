import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ObjectivePathway } from "@/lib/ascension/result-model";
import type { DesignPart } from "@/lib/ascension/parts-model";
import type { RealityMode } from "./RealityViewer";

const RealityWorkbench = lazy(() => import("./RealityViewer").then(module => ({ default: module.RealityViewer })));
type ExploreView = "blueprint" | "dissect" | "cad" | "environment" | "simulation";
type RealitySelection = { path: Pathway; mode: RealityMode; action: "dissect" | "simulate" | null };
function asViewerPathway(path: Pathway): ObjectivePathway {
  return {
    id: path.id, label: path.title, summary: path.summary, steps: path.steps,
    tradeoffs: path.tradeoffs, spiral_form: null, visual_svg: null, model_spec: null,
    generated_image_url: null, generated_blueprint_url: null,
    generated_environment_url: null, model_url: null,
    outcome_score: null, outcome_reason: null,
  };
}
function asNamedParts(path: Pathway): DesignPart[] {
  return path.parts.map(part => ({
    name: part.name, purpose: part.purpose, location: part.location,
    operation: "Detailed operation has not been specified for this component.",
    connections: "Physical connections have not been established.",
    limitations: "Concept only. Coordinates and mechanical dimensions are not verified.",
    x: -1, y: -1, // Metadata-only labels: NEVER projected onto unrelated mesh geometry.
  }));
}

type Part = { name: string; purpose: string; location: string };
type Pathway = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[] };
type Result = { introduction: string; pathways: Pathway[]; blend: Pathway & { blend_reason: string };
  contributors: string[]; unavailable: string[]; providerErrors: string[]; mode: string; verified: false; governance: string; persistence: string };
const SCENE = "/approved-scene/ascension-tree-behind-book-hq.jpg";

let speechSequence = 0;
let activeUtterance: SpeechSynthesisUtterance | null = null;
function say(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  const sequence = ++speechSequence;
  const synth = window.speechSynthesis;
  try { synth.cancel(); } catch { return; }
  const chunks: string[] = [];
  let chunk = "";
  for (const word of text.trim().split(/\s+/)) {
    if (chunk && chunk.length + word.length + 1 > 220) {
      chunks.push(chunk);
      chunk = word;
    } else {
      chunk += (chunk ? " " : "") + word;
    }
  }
  if (chunk) chunks.push(chunk);
  let index = 0;
  const next = () => {
    if (sequence !== speechSequence || index >= chunks.length) {
      if (sequence === speechSequence) activeUtterance = null;
      return;
    }
    const words = new SpeechSynthesisUtterance(chunks[index++]!);
    activeUtterance = words;
    words.rate = 0.93;
    words.pitch = 0.98;
    words.onend = next;
    words.onerror = next;
    try { synth.speak(words); } catch { activeUtterance = null; }
  };
  next();
}
function stopVoice() {
  speechSequence += 1;
  activeUtterance = null;
  try { window.speechSynthesis?.cancel(); } catch { /* Browser may lack speech playback. */ }
}
function PathwayView({ path, onView }: { path: Pathway & { blend_reason?: string }; onView: (mode: ExploreView) => void }) {
  const [section, setSection] = useState<"description" | "labels">("description");
  const [partIndex, setPartIndex] = useState<number | null>(null);
  useEffect(() => { setPartIndex(null); setSection("description"); }, [path.id]);
  const part = partIndex === null ? null : path.parts[partIndex];
  return <section className="ascension-pathway-detail rounded-2xl border border-gold/35 bg-[#05101de8] p-5 shadow-2xl sm:p-7" aria-label={path.title}>
    <h3 className="mb-3 text-lg text-gold">{path.title}</h3>
    <div className="ascension-view-switch" role="group" aria-label="Explore this pathway">
      {(["description","labels"] as const).map(mode => <button type="button" key={mode}
        aria-pressed={section === mode} onClick={() => setSection(mode)}
        className="ascension-view-choice">{mode.toUpperCase()}</button>)}
      {(["blueprint","dissect","cad","environment","simulation"] as const).map(mode => <button
        type="button" key={mode} onClick={() => onView(mode)}
        className="ascension-view-choice" aria-label={"Open " + mode + " view of " + path.title}>
        {mode.toUpperCase()}</button>)}
    </div>
    {section === "description" ? <div className="ascension-description-panel">
      <p className="mb-5 max-w-3xl leading-7 text-foreground">{path.summary}</p>
      {path.blend_reason && <p className="mb-4 border-l-2 border-primary pl-4 text-sm text-foreground/85">{path.blend_reason}</p>}
      <h4 className="mb-2 text-sm font-semibold text-primary">How this approach works</h4>
      <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm leading-6">
        {path.steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
      {path.tradeoffs.length > 0 && <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer text-gold">Limits and tradeoffs</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">{path.tradeoffs.map((v, i) => <li key={i}>{v}</li>)}</ul>
      </details>}
    </div> : <div className="ascension-labels-panel">
      {path.parts.length > 0 ? <div className="grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <div className="ascension-label-buttons" aria-label="Select a named part">
          {path.parts.map((p, index) => <button type="button" key={p.name + index}
            aria-pressed={partIndex === index} onClick={() => setPartIndex(index)}
            className="block w-full rounded-lg border border-gold/30 bg-black/25 p-3 text-left text-sm hover:border-gold">
            {index + 1}. {p.name}</button>)}
        </div>
        <div className="min-h-40 rounded-xl border border-primary/25 bg-[#08192a] p-5" aria-live="polite">
          {part ? <>
            <h4 className="mb-3 text-gold">{part.name}</h4>
            <p className="mb-3 text-sm"><strong>What it does:</strong> {part.purpose}</p>
            <p className="text-sm"><strong>Where it belongs:</strong> {part.location || "Not yet determined."}</p>
          </> : <p className="text-sm text-muted-foreground">Choose a label to inspect the part's purpose and place in the proposed design.</p>}
        </div>
      </div> : <p className="text-sm text-muted-foreground">No named components were returned for this pathway.</p>}
      <p className="mt-4 text-xs text-muted-foreground">Component descriptions are conceptual; physical positions have not been measured.</p>
    </div>}
  </section>;
}

/** Hosted Tree entry. The first model answer is backend context, not a public essay. */
export function IndependentEngage() {
  const [objective, setObjective] = useState("");
  const [requested, setRequested] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [firstAnswer, setFirstAnswer] = useState("");
  const [pathwayError, setPathwayError] = useState("");
  const [refinement, setRefinement] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [stage, setStage] = useState<"idle" | "processing" | "eruption">("idle");
  const [talking, setTalking] = useState(true);
  const [reality, setReality] = useState<RealitySelection | null>(null);
  const [realitySound, setRealitySound] = useState(false);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const view = useRef<HTMLElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); stopVoice(); }, []);

  async function generatePathways(text: string, answer: string, controller: AbortController, token: number) {
    setPathwayError("");
    try {
      const response = await fetch("/api/public/ascension/independent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: text, phase: "pathways", firstAnswer: answer.slice(0, 6000) }),
        signal: controller.signal,
      });
      const data: Result & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Pathway synthesis did not complete.");
      if (!Array.isArray(data.pathways) || data.pathways.length !== 3 || !data.blend)
        throw new Error("The answer engine did not deliver three pathways and a blend.");
      if (generation.current !== token) return;
      setResult(data);
      setChoice(null);
      setStage("eruption");
      if (talking) say("I found three approaches and a fourth blend. Choose a pathway to explore.");
      window.setTimeout(() => {
        if (generation.current === token) view.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === token) {
        setPathwayError(cause instanceof Error ? cause.message : String(cause));
        setStage("idle");
      }
    }
  }

  async function engage(override?: string) {
    const text = (override ?? objective).trim();
    if (text.length < 3 || loading) return;
    const token = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    stopVoice();
    // Keep private refinement context out of the visible objective field.
    if (!override) setObjective(text);
    setRequested(text);
    setLoading(true);
    setError("");
    setPathwayError("");
    setResult(null);
    setFirstAnswer("");
    setRefinement("");
    setChoice(null);
    setReality(null);
    setSelectedParts([]);
    setStage("processing");
    if (talking) say("Exploring your objective.");
    try {
      // Internal reasoning only: never narrate or render this essay to the user.
      const response = await fetch("/api/public/ascension/independent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: text, phase: "initial" }),
        signal: controller.signal,
      });
      const data: { phase?: string; answer?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "The answer engine did not complete.");
      if (data.phase !== "initial" || !data.answer?.trim())
        throw new Error("The answer engine returned no usable analysis.");
      if (generation.current !== token) return;
      const answer = data.answer.trim();
      setFirstAnswer(answer);
      await generatePathways(text, answer, controller, token);
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === token) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStage("idle");
      }
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }

  function retryPathways() {
    if (loading || !firstAnswer || !requested) return;
    const token = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); setStage("processing"); setPathwayError("");
    void generatePathways(requested, firstAnswer, controller, token)
      .finally(() => { if (generation.current === token) setLoading(false); });
  }

  function buildOn(path: Pathway, changes = "") {
    const originalObjective = requested.split("\nBuild on the selected pathway:")[0] ?? requested;
    const next = (originalObjective + "\nBuild on the selected pathway: " + path.title +
      "\nPreserve these features: " + path.summary +
      (changes.trim() ? "\nChange or improve: " + changes.trim() : "\nImprove and extend it without starting over."))
      .slice(0, 2400);
    void engage(next);
  }

  function reset() {
    generation.current += 1;
    abort.current?.abort();
    stopVoice();
    setObjective(""); setRequested(""); setError(""); setResult(null);
    setFirstAnswer(""); setRefinement(""); setPathwayError(""); setLoading(false);
    setStage("idle"); setChoice(null);
    setReality(null); setSelectedParts([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const choices = result ? [...result.pathways, result.blend] : [];
  const selected = choice === null ? null : choices[choice];
  const openReality = (path: Pathway, view: ExploreView) => {
    stopVoice();
    const mode: RealityMode = view === "blueprint" ? "blueprint" : view === "environment" || view === "simulation" ? "environment" : "cad";
    const action = view === "dissect" ? "dissect" : view === "simulation" ? "simulate" : null;
    setReality({ path, mode, action });
  };
  const togglePart = (part: DesignPart, field?: string) => {
    const key = part.name + "::" + (field ?? "whole");
    setSelectedParts(list => list.includes(key) ? list.filter(x => x !== key) : [...list, key]);
  };

  return <div className="ascension-world relative isolate mx-auto w-full max-w-none"
    data-book-sequence={stage === "idle" ? undefined : stage} data-has-run={result ? "true" : undefined}>
    <section aria-label="Engage ASCENSION" className="ascension-command">
      <div className="ascension-stage">
        <div className="ascension-scene-hero" aria-hidden="true">
          <img className="ascension-tree-scene" src={SCENE} alt="" draggable={false} />
        </div>
        <label htmlFor="objective">What do you want to accomplish?</label>
        <textarea id="objective" rows={3} value={objective} maxLength={2400} disabled={loading}
          aria-label="What do you want to accomplish?" placeholder="What do you want to accomplish?"
          onChange={event => setObjective(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !loading) { event.preventDefault(); void engage(); } }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={loading || objective.trim().length < 3} onClick={() => void engage()}
            className="min-h-12 rounded-full border border-gold/55 bg-gold/10 px-7 text-sm font-medium tracking-wide text-gold">
            {loading ? "ENGAGING ASCENSION…" : "ENGAGE ASCENSION"}
          </button>
        </div>
        {error && <p role="alert" className="relative z-30 rounded-xl border border-red-500 p-4 text-sm text-red-200">{error}</p>}
      </div>
    </section>

    {loading && <section className="mx-auto mt-4 max-w-3xl p-5 text-center text-gold" role="status">
      Developing your pathways…
      <button type="button" className="ml-4 underline" onClick={() => {
        generation.current += 1; abort.current?.abort(); stopVoice();
        setLoading(false); setStage("idle");
      }}>Stop</button>
    </section>}

    {!loading && pathwayError && <section className="mx-auto mt-4 max-w-3xl rounded-xl border border-gold/35 p-5" role="alert">
      <p>Pathways could not be completed: {pathwayError}</p>
      <button type="button" onClick={retryPathways} className="mt-3 rounded-full border border-gold/50 px-4 py-2 text-gold">
        Retry pathways
      </button>
    </section>}

    {result && <section ref={view} className="ascension-result-reveal mx-auto mt-5 max-w-6xl space-y-5 rounded-xl border border-gold/25 bg-[#020913ed] p-4 sm:p-7" aria-label="ASCENSION pathways">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg text-gold">THREE PATHWAYS + FOURTH BLEND</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => {
            if (talking) stopVoice();
            else say(selected ? selected.title + ". " + selected.summary : "Three pathways and a blend are ready.");
            setTalking(!talking);
          }} className="rounded-full border border-gold/40 px-4 py-2 text-gold">
            {talking ? "Mute Tree" : "Hear Tree"}
          </button>
          <button type="button" onClick={reset} className="rounded-full border border-gold/40 px-4 py-2 text-gold">New objective</button>
        </div>
      </div>
      <p className="text-sm text-foreground/80">{requested.split("\nBuild on the selected pathway:")[0]}</p>
      <div role="tablist" aria-label="Choose a pathway" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {choices.map((p, index) => <button type="button" role="tab" aria-selected={choice === index}
          key={p.id} className={"min-h-40 rounded-xl border p-4 text-left transition-colors " +
            (choice === index ? "border-primary bg-primary/15 text-primary" : "border-gold/30 bg-black/30 text-gold")}
          onClick={() => {
            setChoice(index); setRefinement("");
            if (talking) say(p.title + ". " + p.summary);
          }}>
          <span className="block text-xs tracking-wide">{index === 3 ? "FOURTH · BLEND" : "PATHWAY " + (index + 1)}</span>
          <strong className="mt-2 block text-base text-foreground">{p.title}</strong>
          <span className="mt-3 block text-sm leading-6 text-foreground/80">
            {p.summary.length > 190 ? p.summary.slice(0, 187).trimEnd() + "…" : p.summary}
          </span>
        </button>)}
      </div>
      {selected && <>
        <PathwayView key={selected.id} path={selected} onView={mode => openReality(selected, mode)} />
        <div className="rounded-xl border border-primary/25 p-4">
          <label htmlFor="pathway-refinement" className="mb-2 block text-sm text-primary">Fine-tune this pathway</label>
          <textarea id="pathway-refinement" rows={2} maxLength={900} value={refinement}
            onChange={event => setRefinement(event.target.value)}
            placeholder="What should ASCENSION change or improve?"
            className="w-full rounded-lg border border-gold/30 bg-black/30 p-3 text-sm text-foreground" />
          <button type="button" onClick={() => buildOn(selected, refinement)}
            className="mt-3 rounded-full border border-primary/50 px-4 py-2 text-sm text-primary">
            BUILD ON RESULT
          </button>
        </div>
      </>}
    </section>}
    {reality && <Suspense fallback={<div className="ascension-workbench-loading" role="status">Opening reality views…</div>}>
      <RealityWorkbench
        key={reality.path.id + reality.mode + (reality.action ?? "")}
        pathway={asViewerPathway(reality.path)}
        objective={requested.split("\nBuild on the selected pathway:")[0] ?? requested}
        requestId={null}
        initialMode={reality.mode}
        initialAction={reality.action}
        providedParts={asNamedParts(reality.path)}
        onClose={() => setReality(null)}
        onNewObjective={reset}
        newObjectiveDisabled={loading}
        soundEnabled={realitySound}
        onToggleSound={() => setRealitySound(value => !value)}
        onDive={() => {}}
        onBuildOn={() => { const path = reality.path; setReality(null); buildOn(path); }}
        onNewAnswers={() => { setReality(null); void engage(objective); }}
        isPartSelected={(part, field) => selectedParts.includes(part.name + "::" + (field ?? "whole"))}
        onTogglePart={togglePart}
        blendControls={selectedParts.length >= 2 ? <div className="reality-revision-actions">
          <button type="button" onClick={() => {
            const path = reality.path;
            const names = selectedParts.map(value => value.split("::")[0]).filter((name, i, a) => a.indexOf(name) === i);
            setReality(null);
            buildOn(path, "Combine these selected parts in the next design: " + names.join(", "));
          }}>BLEND SELECTED PARTS</button>
        </div> : null}
      />
    </Suspense>}
  </div>;
}
