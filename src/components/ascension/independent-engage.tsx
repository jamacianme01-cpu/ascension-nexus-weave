import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ObjectivePathway } from "@/lib/ascension/result-model";

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
const WELCOME = "Welcome. I can stay with you as a guide.";

function pathwayGuide(index: number, namedProviders: boolean) {
  if (index === 3) {
    return {
      eyebrow: "BLEND",
      tone: namedProviders ? "SYNTHESIZED · BALANCED · VERSATILE" : "A possible combination of the other three",
    };
  }
  if (namedProviders) {
    const eyebrows = ["OPENAI", "CLAUDE", "GROK"];
    const tones = [
      "MODULAR · PRECISE · ADAPTIVE",
      "CONTEMPLATIVE · STRUCTURED · RELIABLE",
      "BOLD · EXPLORATORY · UNFILTERED",
    ];
    return { eyebrow: eyebrows[index] ?? `PATH ${index + 1}`, tone: tones[index] ?? "Another way to look at it" };
  }
  const eyebrows = ["ONE READING", "ANOTHER READING", "A WIDER READING"];
  const tones = [
    "A precise reading, if that fits",
    "A more structured reading, if that fits",
    "A wider reading, if that fits",
  ];
  return { eyebrow: eyebrows[index] ?? `PATH ${index + 1}`, tone: tones[index] ?? "Another way to look at it" };
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
  const [choice, setChoice] = useState<number | null>(null);
  const [dive, setDive] = useState<{ pathway: Pathway; imageUrl: string } | null>(null);
  const [stage, setStage] = useState<"idle" | "processing">("idle");
  const [talking, setTalking] = useState(true);
  const [guideLine, setGuideLine] = useState(WELCOME);
  const view = useRef<HTMLElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const welcomed = useRef(false);
  useEffect(() => {
    if (welcomed.current) return;
    welcomed.current = true;
    say(WELCOME);
  }, []);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); stopVoice(); }, []);
  function offer(text: string) {
    setGuideLine(text);
    if (talking) say(text);
  }
  function toggleTalking() {
    if (talking) { stopVoice(); setTalking(false); }
    else {
      const line = "I'm here if a suggestion would help.";
      setTalking(true);
      setGuideLine(line);
      say(line);
    }
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
      setChoice(null);
      offer("Three approaches are here, and a fourth that brings pieces of them together. Any of them can be opened if a closer look would help.");
      setStage("idle");
      window.setTimeout(() => {
        if (generation.current === token) view.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === token) {
        setPathwayError(cause instanceof Error ? cause.message : String(cause));
        setGuideLine("The pathways didn't finish. Trying again is there whenever you want it.");
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
    if (!override) setObjective(text);
    setRequested(text);
    setLoading(true);
    setError("");
    setPathwayError("");
    setResult(null);
    setFirstAnswer("");
    setChoice(null);
    setDive(null);
    setStage("processing");
    setGuideLine("Looking at a few different ways this could go.");
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
        setGuideLine("That didn't connect. The book can wait for another intention.");
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
    setGuideLine(WELCOME);
    setStage("idle"); setChoice(null); setDive(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const choices = result ? [...result.pathways, result.blend] : [];

  return <div className="ascension-world relative isolate mx-auto w-full max-w-none"
    data-book-sequence={stage === "idle" ? undefined : stage} data-has-run={result ? "true" : undefined}>
    <section aria-label="Engage ASCENSION" className="ascension-command" hidden={Boolean(result)}>
      <div className="ascension-stage">
        <div className="ascension-scene-hero" aria-hidden="true">
          <img className="ascension-tree-scene" src={SCENE} alt="" draggable={false} />
        </div>
        <label htmlFor="objective">What do you want to accomplish?</label>
        <textarea id="objective" rows={3} value={objective} maxLength={2400} disabled={loading}
          aria-label="What do you want to accomplish?" placeholder="Type your intention..."
          onChange={event => setObjective(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !loading) { event.preventDefault(); void engage(); } }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={loading || objective.trim().length < 3} onClick={() => void engage()}
            className="ascension-engage min-h-12 rounded-full border border-gold/55 bg-gold/10 px-7 text-sm font-medium tracking-wide text-gold">
            {loading ? "ENGAGING ASCENSION…" : "ENGAGE ASCENSION"}
          </button>
        </div>
        <button type="button" onClick={toggleTalking} aria-pressed={!talking} className="ascension-tree-hear">
          {talking ? "QUIET THE TREE" : "HEAR THE TREE"}
        </button>
        {talking && guideLine && <p className="ascension-tree-whisper" role="status">{guideLine}</p>}
        {loading && <p className="ascension-tree-status" role="status">
          {!talking && "Looking at a few different ways this could go. "}
          <button type="button" onClick={() => {
            generation.current += 1; abort.current?.abort(); stopVoice();
            setLoading(false); setStage("idle");
            setGuideLine("Stopped. The book can wait until you want to try again.");
          }}>Stop</button>
        </p>}
        {error && <p role="alert">{error}</p>}
        {!loading && pathwayError && <p role="alert">
          Pathways could not be completed: {pathwayError}
          <button type="button" onClick={retryPathways}>Retry pathways</button>
        </p>}
      </div>
    </section>

    {result && <section ref={view} className="ascension-spiral" aria-label="Spiral pathways">
      <div className="ascension-spiral-head">
        <p className="ascension-spiral-kicker">SPIRAL PATHWAYS</p>
        <div className="ascension-spiral-mark" aria-hidden="true" />
        <h2>3 DISTINCT PATHS + BLEND</h2>
        {talking && guideLine && <p className="ascension-tree-whisper" role="status">{guideLine}</p>}
        <p className="ascension-spiral-note">
          {result.mode === "three-provider-synthesis"
            ? "OpenAI, Claude, and Grok each offered a reading. The fourth is a blend you can open if it seems useful."
            : "These are three different readings, plus a blend. Claude and Grok were not connected, so none of these is presented as their answer."}
        </p>
        <p className="ascension-spiral-objective">{requested.split("\nBuild on the selected pathway:")[0]}</p>
        <div className="ascension-spiral-tools">
          <button type="button" onClick={toggleTalking}>
            {talking ? "Quiet the tree" : "Hear the tree"}
          </button>
          <button type="button" onClick={reset}>New objective</button>
        </div>
      </div>
      <div className="ascension-spiral-grid">
        {choices.map((p, index) => {
          const guide = pathwayGuide(index, result.mode === "three-provider-synthesis");
          const summary = p.summary.length > 280 ? p.summary.slice(0, 277).trimEnd() + "…" : p.summary;
          return <button type="button" key={p.id}
            className={choice === index ? "ascension-path-card is-open" : "ascension-path-card"}
            aria-pressed={choice === index}
            onClick={() => {
              setChoice(index);
              offer(p.title + ". This is one way it might come together. You could turn it, look inside, or set the parts apart.");
              setDive({ pathway: p, imageUrl: "" });
            }}>
            <span className="ascension-path-index" aria-hidden="true">{index + 1}</span>
            <span className="ascension-path-eyebrow">{guide.eyebrow}</span>
            <strong>{p.title}</strong>
            <span className="ascension-path-summary">{summary}</span>
            <span className="ascension-path-tone">{guide.tone}</span>
          </button>;
        })}
      </div>
    </section>}
    {dive && <Suspense fallback={<p role="status" className="p-5 text-center text-gold">Opening invention view…</p>}>
      <RealityViewer
        pathway={{
          id: dive.pathway.id, label: dive.pathway.title, summary: dive.pathway.summary,
          steps: dive.pathway.steps, tradeoffs: dive.pathway.tradeoffs,
          spiral_form: null, visual_svg: null, model_spec: null,
          generated_image_url: dive.imageUrl, generated_blueprint_url: null,
          generated_environment_url: null, model_url: null,
          outcome_score: null, outcome_reason: null,
        } satisfies ObjectivePathway}
        objective={requested} requestId={null} initialMode="cutaway"
        onClose={() => setDive(null)}
        onNewObjective={reset} newObjectiveDisabled={loading}
        soundEnabled={talking}
        onToggleSound={() => { stopVoice(); setTalking(v => !v); }}
        onDive={() => {}}
        onBuildOn={() => { const selectedPath = dive.pathway; setDive(null); buildOn(selectedPath); }}
        onNewAnswers={() => setDive(null)}
        isPartSelected={() => false} onTogglePart={() => {}}
        blendControls={null}
      />
    </Suspense>}
  </div>;
}
