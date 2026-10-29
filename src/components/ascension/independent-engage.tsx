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

/** V1 component diagram: indicative arrangement only; no fabricated measured geometry. */
function ComponentDiagram({ parts, mode, selected, onSelect }: {
  parts: Part[]; mode: "blueprint" | "dissect" | "exploded"; selected: string | null; onSelect: (part: Part) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  useEffect(() => { setZoom(1); setRotation(0); }, [parts, mode]);
  const count = Math.min(parts.length, 12);
  const nodes = parts.slice(0, count).map((part, index) => {
    const angle = (index * Math.PI * 2) / Math.max(count, 1) - Math.PI / 2;
    const radius = mode === "exploded" ? 170 : mode === "dissect" ? 130 : 112;
    return { part, x: 250 + Math.cos(angle) * radius, y: 210 + Math.sin(angle) * radius };
  });
  return <div className="rounded-xl border border-gold/30 bg-[#08192a] p-3" aria-label="Interactive conceptual component diagram">
    <div className="mb-2 flex flex-wrap gap-2">
      <button type="button" onClick={() => setZoom(v => Math.min(2.5, +(v + .25).toFixed(2)))} className="rounded border border-gold/40 px-3 py-1" aria-label="Zoom in">Zoom +</button>
      <button type="button" onClick={() => setZoom(v => Math.max(.5, +(v - .25).toFixed(2)))} className="rounded border border-gold/40 px-3 py-1" aria-label="Zoom out">Zoom −</button>
      <button type="button" onClick={() => setRotation(v => v - 30)} className="rounded border border-gold/40 px-3 py-1">Rotate left</button>
      <button type="button" onClick={() => setRotation(v => v + 30)} className="rounded border border-gold/40 px-3 py-1">Rotate right</button>
      <button type="button" onClick={() => { setZoom(1); setRotation(0); }} className="rounded border border-gold/40 px-3 py-1">Reset view</button>
    </div>
    <svg viewBox="0 0 500 420" className="h-auto w-full" role="img" aria-label={mode + " view of " + count + " conceptual components"}>
      <defs><pattern id="ascension-v1-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#54738b" strokeOpacity=".25" strokeWidth="1"/></pattern></defs>
      <rect width="500" height="420" fill="url(#ascension-v1-grid)"/>
      <g transform={`translate(250 210) rotate(${rotation}) scale(${zoom}) translate(-250 -210)`}>
        {nodes.map(({part,x,y},i) => <g key={i}>
          <line x1="250" y1="210" x2={x} y2={y} stroke="#7b9fb1" strokeDasharray={mode === "exploded" ? "5 5" : undefined} opacity=".65" />
          <g onClick={() => onSelect(part)} className="cursor-pointer" role="button" tabIndex={0} aria-label={"Inspect " + part.name}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(part); } }}>
            <rect x={x-40} y={y-22} width="80" height="44" rx="7" fill={selected === part.name ? "#84631c" : "#143b50"} stroke={selected === part.name ? "#ffdf84" : "#8ac8d5"} strokeWidth="2"/>
            <text x={x} y={y+5} fontSize="15" fill="#fff" textAnchor="middle">{i+1}</text>
          </g>
        </g>)}
        <circle cx="250" cy="210" r="31" fill="#0c2940" stroke="#e1bf68" strokeWidth="2" />
        <text x="250" y="215" fill="#f5db9f" fontSize="12" textAnchor="middle">CORE</text>
      </g>
    </svg>
    <p className="text-xs text-muted-foreground">Conceptual component layout only. Numbers correspond to the component list; positions and dimensions have not been physically verified.</p>
  </div>;
}

function PathwayView({ path }: { path: Pathway & { blend_reason?: string } }) {
  const [part, setPart] = useState<Part | null>(null);
  const [mode, setMode] = useState<"blueprint" | "dissect" | "exploded">("blueprint");
  useEffect(() => { setPart(null); setMode("blueprint"); }, [path.id]);
  return <section className="rounded-2xl border border-gold/35 bg-[#05101de8] p-5 shadow-2xl sm:p-7">
    <h3 className="mb-3 text-lg text-gold">{path.title}</h3>
    <p className="mb-5 max-w-3xl leading-7 text-foreground">{path.summary}</p>
    {path.blend_reason && <p className="mb-4 border-l-2 border-primary pl-4 text-sm text-foreground/85">{path.blend_reason}</p>}
    <h4 className="mb-2 text-sm font-semibold text-primary">How this approach works</h4>
    <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm leading-6">
      {path.steps.map((step, i) => <li key={i}>{step}</li>)}
    </ol>
    {path.parts.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{(["blueprint", "dissect", "exploded"] as const).map(view => <button type="button" key={view} onClick={() => setMode(view)} aria-pressed={mode === view} className={"rounded-full border px-4 py-2 text-sm " + (mode === view ? "border-gold bg-gold/15 text-gold" : "border-gold/30")}>{view === "exploded" ? "Exploded / Imploded" : view === "dissect" ? "Dissect" : "Blueprint"}</button>)}</div>}
    {path.parts.length > 0 && <ComponentDiagram parts={path.parts} mode={mode} selected={part?.name ?? null} onSelect={setPart} />}
    {path.parts.length > 0 && <div className="mb-5 mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-2" aria-label="Select components">
        <h4 className="text-sm font-semibold text-primary">Components — select to inspect</h4>
        {path.parts.map((p, i) => <button type="button" key={i} onClick={() => setPart(p)}
          className="block w-full rounded-lg border border-gold/30 bg-black/25 p-3 text-left text-sm hover:border-gold">
          {i + 1}. {p.name}</button>)}
      </div>
      <div className="min-h-40 rounded-xl border border-primary/25 bg-[#08192a] p-5">
        {part ? <><h4 className="mb-2 text-gold">{part.name}</h4><p className="mb-3 text-sm">{part.purpose}</p>
          {part.location && <p className="text-xs text-muted-foreground">Location / relationship: {part.location}</p>}</>
          : <p className="text-sm text-muted-foreground">Select a component to see what it does and where it belongs.</p>}
        <p className="mt-4 text-xs text-muted-foreground">Concept description — not an interactive CAD model.</p>
      </div>
    </div>}
    {path.tradeoffs.length > 0 && <details className="mb-5 text-sm text-muted-foreground">
      <summary className="cursor-pointer text-gold">Limits and tradeoffs</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{path.tradeoffs.map((v, i) => <li key={i}>{v}</li>)}</ul>
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
