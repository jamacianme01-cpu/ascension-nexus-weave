import { useEffect, useRef, useState } from "react";

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
function PathwayView({ path }: { path: Pathway & { blend_reason?: string } }) {
  const [part, setPart] = useState<Part | null>(null);
  const [mode, setMode] = useState<"picture" | "blueprint" | "dissect" | "exploded" | "imploded">("picture");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  useEffect(() => { setPart(null); setMode("picture"); setZoom(1); setRotation(0); }, [path.id]);
  const parts = path.parts.slice(0, 8);
  const exploded = mode === "exploded" || mode === "dissect";
  const blueprint = mode === "blueprint";
  const slots = parts.map((p, index) => {
    const angle = (index * Math.PI * 2) / Math.max(parts.length, 1) - Math.PI / 2;
    const radius = exploded ? 160 : 105;
    return { p, x: 300 + Math.cos(angle) * radius, y: 205 + Math.sin(angle) * radius, index };
  });
  return <section className="rounded-2xl border border-gold/35 bg-[#05101de8] p-4 sm:p-7">
    <h3 className="mb-2 text-lg text-gold">{path.title}</h3>
    <p className="mb-4 max-w-3xl text-sm leading-6 text-foreground">{path.summary}</p>
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Inspect selected pathway">
      {(["picture","blueprint","dissect","exploded","imploded"] as const).map(view => <button key={view} type="button"
        aria-pressed={mode === view} onClick={() => { setMode(view); setPart(null); }}
        className={"rounded-full border px-3 py-2 text-sm capitalize " + (mode === view ? "border-primary bg-primary/20 text-primary" : "border-gold/30 text-gold")}>{view}</button>)}
    </div>
    <div className="overflow-hidden rounded-xl border border-gold/25 bg-[#071321]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
        <span className="text-xs text-foreground/75">{blueprint ? "Concept blueprint — dimensions not verified" : "Component concept illustration — not a generated product picture"}</span>
        <div className="flex gap-2">
          <button type="button" className="rounded border border-gold/35 px-3 py-2 text-sm text-gold" onClick={() => setZoom(z => Math.min(2.5,z+.25))} aria-label="Zoom in">+</button>
          <button type="button" className="rounded border border-gold/35 px-3 py-2 text-sm text-gold" onClick={() => setZoom(z => Math.max(.65,z-.25))} aria-label="Zoom out">−</button>
          <button type="button" className="rounded border border-gold/35 px-3 py-2 text-sm text-gold" onClick={() => setRotation(deg => (deg+45)%360)}>Rotate</button>
          <button type="button" className="rounded border border-gold/35 px-3 py-2 text-sm text-gold" onClick={() => {setZoom(1);setRotation(0);}}>Reset</button>
        </div>
      </div>
      {parts.length ? <svg viewBox="0 0 600 420" role="img" aria-label={mode + " conceptual arrangement of " + path.title}
        className="block h-auto w-full" style={{ touchAction: "pan-y" }}>
        {blueprint && <defs><pattern id="ascension-blueprint-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#3f7890" strokeWidth=".5"/></pattern></defs>}
        {blueprint && <rect width="600" height="420" fill="url(#ascension-blueprint-grid)" />}
        <g transform={`translate(300 205) rotate(${rotation}) scale(${zoom}) translate(-300 -205)`}>
          {!exploded && <ellipse cx="300" cy="205" rx="180" ry="138" fill="none" stroke="#8d9eaf" strokeDasharray="5 7" />}
          {slots.map(({p,x,y,index}) => <g key={index} onClick={() => setPart(p)} role="button" tabIndex={0}
            onKeyDown={event => {if(event.key === "Enter" || event.key === " "){event.preventDefault();setPart(p);}}}
            aria-label={"Inspect "+p.name} className="cursor-pointer">
            {exploded && <path d={`M300 205 L${x} ${y}`} stroke="#788da3" strokeDasharray="5 5" />}
            <rect x={x-62} y={y-27} width="124" height="54" rx={blueprint?2:12}
              stroke={part?.name===p.name?"#ffffff":"#c6a86e"} strokeWidth={part?.name===p.name?3:1.5} fill="#173044"/>
            <text x={x} y={y+4} fontSize="12" fill="#ffffff" textAnchor="middle">{p.name.length>19?p.name.slice(0,17)+"…":p.name}</text>
          </g>)}
        </g>
      </svg> : <div className="p-6 text-sm text-foreground/80">No component illustration is available for this pathway.</div>}
    </div>
    {part && <div className="mt-3 rounded-lg border border-primary/30 p-3 text-sm">
      <strong className="text-gold">{part.name}</strong><p className="mt-1">{part.purpose}</p>
      {part.location && <p className="mt-1 text-foreground/70">Location: {part.location}</p>}
      <button type="button" className="mt-2 text-xs text-gold underline" onClick={() => setPart(null)}>Close description</button>
    </div>}
    <details className="mt-4"><summary className="cursor-pointer text-sm text-gold">How this pathway works</summary>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6">{path.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>
      {path.blend_reason && <p className="mt-3 text-sm">{path.blend_reason}</p>}
    </details>
    {path.tradeoffs.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer text-gold">Limits and tradeoffs</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{path.tradeoffs.map((item,i)=><li key={i}>{item}</li>)}</ul>
    </details>}
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
      // Do not interrupt the Tree reading the initial answer when pathways arrive.
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
      // The Tree must not narrate the full written answer.
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const choices = result ? [...result.pathways, result.blend] : [];
  const selected = choice === null ? null : choices[choice];

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

    {firstAnswer && <section className="mx-auto mt-5 max-w-3xl rounded-xl border border-gold/35 bg-[#05101de8] p-5" aria-label="Initial answer">
      <h2 className="mb-3 text-lg text-gold">INITIAL ANSWER</h2>
      <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{firstAnswer}</p>
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
            if (talking) say("Let’s explore " + p.title + ".");
          }}>
          <span className="block text-xs tracking-wide">{index === 3 ? "FOURTH · BLEND" : "PATHWAY " + (index + 1)}</span>
          <strong className="mt-2 block text-base text-foreground">{p.title}</strong>
          <span className="mt-3 block text-sm leading-6 text-foreground/80">
            {p.summary.length > 190 ? p.summary.slice(0, 187).trimEnd() + "…" : p.summary}
          </span>
        </button>)}
      </div>
      {selected && <>
        <PathwayView key={selected.id} path={selected} />
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
  </div>;
}
