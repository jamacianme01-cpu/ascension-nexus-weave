import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ObjectivePathway } from "@/lib/ascension/result-model";
import "./flow-screen.css";

const RealityViewer = lazy(() => import("@/components/ascension/RealityViewer").then(mod => ({ default: mod.RealityViewer })));

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
function traitLine(path: Pathway) {
  const fragments = path.summary
    .split(/[,.;]/)
    .map(piece => piece.replace(/[^a-z0-9 ]/gi, "").trim())
    .filter(piece => piece.length > 3 && piece.length < 32)
    .slice(0, 3);
  if (fragments.length >= 2) return fragments.map(piece => piece.toUpperCase()).join(" • ");
  return path.steps.slice(0, 3).map(step => step.split(/\s+/).slice(0, 2).join(" ").toUpperCase()).filter(Boolean).join(" • ");
}

function columnHeading(index: number, result: Result, path: Pathway) {
  if (index === 3) return "BLEND";
  if (result.mode === "three-provider-synthesis") {
    const name = ["OpenAI", "Claude", "Grok"][index];
    if (name && result.contributors.includes(name)) return name;
  }
  return path.title;
}

function PathwayStill({ path }: { path: Pathway }) {
  const names = (path.parts.length ? path.parts.map(part => part.name) : path.steps).slice(0, 4);
  return <div className="spiral-still" aria-hidden="true">
    <div className="spiral-diagram">
      {names.map(name => <span key={name}>{name}</span>)}
    </div>
  </div>;
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
  const [dive, setDive] = useState<Pathway | null>(null);
  const [stage, setStage] = useState<"idle" | "processing">("idle");
  const [talking, setTalking] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const welcomed = useRef(false);
  useEffect(() => {
    if (welcomed.current) return;
    welcomed.current = true;
    say("Welcome to ASCENSION. What are we creating today? Tell me what you want to accomplish, and I'll help you explore it.");
  }, []);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); stopVoice(); }, []);
  function toggleTalking() {
    if (talking) { stopVoice(); setTalking(false); }
    else { setTalking(true); say("I'm here. Choose a pathway, and I'll help you examine how it works."); }
  }

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
      if (talking) say("Your four approaches are ready. Choose one to inspect its design and components.");
      setStage("idle");
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
    setDive(null);
    setStage("processing");
    // Wait for the real result instead of narrating a progress filler.
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
      // Keep the Tree conversational: announce a short useful finding, never read the whole analysis.
      const firstThought = answer.split(/(?<=[.!?])\s+/)[0]?.trim().slice(0, 240);
      if (talking && firstThought) say(firstThought);
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
    setFirstAnswer(""); setPathwayError(""); setLoading(false);
    setStage("idle"); setDive(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const choices = result ? [...result.pathways, result.blend] : [];

  function openPathway(path: Pathway) {
    stopVoice();
    if (talking) say(path.title + ". Drag to turn it. Choose assembled, blueprint, dissect, exploded, or imploded.");
    setDive(path);
  }

  return <div className="ascension-world relative isolate mx-auto w-full max-w-none"
    data-book-sequence={stage === "idle" ? undefined : stage} data-has-run={result ? "true" : undefined}>
    <section aria-label="Engage ASCENSION" className="ascension-command" hidden={Boolean(result)}>
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
          <button type="button" onClick={toggleTalking} aria-pressed={!talking}
            className="min-h-11 rounded-full border border-gold/35 px-4 text-xs text-gold">
            {talking ? "MUTE TREE" : "HEAR TREE"}
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

    {result && <section className="spiral-pathways" aria-label="Spiral pathways">
      <div className="spiral-head">
        <div>
          <p>SPIRAL PATHWAYS</p>
          <h2>3 DISTINCT PATHS + BLEND</h2>
        </div>
        <div className="spiral-actions">
          <button type="button" onClick={toggleTalking}>{talking ? "SOUND ON" : "SOUND OFF"}</button>
          <button type="button" onClick={reset}>NEW OBJECTIVE</button>
        </div>
      </div>
      <div className="spiral-columns" role="list">
        {choices.map((path, index) => <div role="listitem" key={path.id}>
          <button type="button" className="spiral-column" onClick={() => openPathway(path)}>
            <span className="spiral-index">{index + 1}</span>
            <strong>{columnHeading(index, result, path)}</strong>
            <em className="spiral-traits">{traitLine(path)}</em>
            <PathwayStill path={path} />
            <span className="spiral-name">{path.title}</span>
          </button>
        </div>)}
      </div>
    </section>}
    {dive && <Suspense fallback={<p role="status" className="p-5 text-center text-gold">Opening invention view…</p>}>
      <RealityViewer
        layout="flow"
        pathway={{
          id: dive.id, label: dive.title, summary: dive.summary,
          steps: dive.parts.length ? dive.parts.map(part => part.name) : dive.steps,
          tradeoffs: dive.tradeoffs,
          spiral_form: null, visual_svg: null, model_spec: null,
          generated_image_url: null, generated_blueprint_url: null,
          generated_environment_url: null, model_url: null,
          outcome_score: null, outcome_reason: null,
        } satisfies ObjectivePathway}
        objective={requested} requestId={null} initialMode="cutaway"
        onClose={() => setDive(null)}
        onNewObjective={reset} newObjectiveDisabled={loading}
        soundEnabled={talking}
        onToggleSound={() => { stopVoice(); setTalking(value => !value); }}
        onDive={() => {}}
        onBuildOn={() => { const selectedPath = dive; setDive(null); buildOn(selectedPath); }}
        onNewAnswers={() => setDive(null)}
        isPartSelected={() => false} onTogglePart={() => {}}
        blendControls={null}
      />
    </Suspense>}
  </div>;
}
