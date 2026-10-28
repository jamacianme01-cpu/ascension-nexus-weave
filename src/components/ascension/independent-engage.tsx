import { useEffect, useRef, useState } from "react";

type Part = { name: string; purpose: string; location: string };
type Pathway = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[] };
type Result = { introduction: string; pathways: Pathway[]; blend: Pathway & { blend_reason: string };
  contributors: string[]; unavailable: string[]; providerErrors: string[]; mode: string; verified: false; governance: string; persistence: string };
const SCENE = "/approved-scene/ascension-tree-behind-book-hq.jpg";

function say(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const words = new SpeechSynthesisUtterance(text.slice(0, 900));
    words.rate = 0.93;
    words.pitch = 0.98;
    window.speechSynthesis.speak(words);
  } catch { /* Speech is an enhancement; results remain readable. */ }
}
function stopVoice() {
  try { window.speechSynthesis?.cancel(); } catch { /* Browser may lack speech playback. */ }
}
function PathwayView({ path, onBuild }: { path: Pathway & { blend_reason?: string }; onBuild: (p: Pathway) => void }) {
  const [part, setPart] = useState<Part | null>(null);
  useEffect(() => setPart(null), [path.id]);
  return <section className="rounded-2xl border border-gold/35 bg-[#05101de8] p-5 shadow-2xl sm:p-7">
    <h3 className="mb-3 text-lg text-gold">{path.title}</h3>
    <p className="mb-5 max-w-3xl leading-7 text-foreground">{path.summary}</p>
    {path.blend_reason && <p className="mb-4 border-l-2 border-primary pl-4 text-sm text-foreground/85">{path.blend_reason}</p>}
    <h4 className="mb-2 text-sm font-semibold text-primary">How this approach works</h4>
    <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm leading-6">
      {path.steps.map((step, i) => <li key={i}>{step}</li>)}
    </ol>
    {path.parts.length > 0 && <div className="mb-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-2" aria-label="Select components">
        <h4 className="text-sm font-semibold text-primary">Components — select to inspect</h4>
        {path.parts.map((p, i) => <button type="button" key={i} onClick={() => setPart(p)}
          className="block w-full rounded-lg border border-gold/30 bg-black/25 p-3 text-left text-sm hover:border-gold">
          {p.name}</button>)}
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
    <button type="button" onClick={() => onBuild(path)} className="rounded-full border border-gold/70 bg-gold/10 px-5 py-3 text-sm font-semibold text-gold">
      BUILD ON THIS PATH
    </button>
  </section>;
}

/** Independent hosted entry: approved image intact, no Supabase, no click-to-voice panel. */
export function IndependentEngage() {
  const [objective, setObjective] = useState("");
  const [requested, setRequested] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [firstAnswer, setFirstAnswer] = useState("");
  const [pathwaysLoading, setPathwaysLoading] = useState(false);
  const [pathwayError, setPathwayError] = useState("");
  const [refinement, setRefinement] = useState("");
  const [choice, setChoice] = useState(0);
  const [stage, setStage] = useState<"idle" | "processing" | "eruption">("idle");
  const [talking, setTalking] = useState(true);
  const view = useRef<HTMLElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); stopVoice(); }, []);

  async function generatePathways(text: string, answer: string, controller: AbortController, token: number) {
    setPathwaysLoading(true); setPathwayError("");
    try {
      const response = await fetch("/api/public/ascension/independent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: text, phase: "pathways", firstAnswer: answer }),
        signal: controller.signal,
      });
      const data: Result & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Pathway synthesis did not complete.");
      if (!Array.isArray(data.pathways) || data.pathways.length !== 3 || !data.blend)
        throw new Error("The answer engine did not deliver three approaches and a blend.");
      if (generation.current !== token) return;
      setResult(data); setChoice(0);
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === token)
        setPathwayError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === token) setPathwaysLoading(false);
    }
  }
  async function engage() {
    const text = objective.trim();
    if (text.length < 3 || loading || pathwaysLoading) return;
    const token = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setRequested(text); setLoading(true); setError(""); setPathwayError("");
    setResult(null); setFirstAnswer(""); setRefinement(""); setStage("processing");
    if (talking) say("I am exploring your objective. I'll start with a direct answer.");
    try {
      const response = await fetch("/api/public/ascension/independent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: text, phase: "initial" }),
        signal: controller.signal,
      });
      const data: { phase?: string; answer?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "The initial answer did not complete.");
      if (data.phase !== "initial" || !data.answer?.trim())
        throw new Error("The initial answer was not readable.");
      if (generation.current !== token) return;
      const answer = data.answer.trim();
      setFirstAnswer(answer);
      setLoading(false); setStage("eruption");
      if (talking) say(answer);
      window.setTimeout(() => view.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
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
    if (pathwaysLoading || !firstAnswer || !requested) return;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    const token = ++generation.current;
    void generatePathways(requested, firstAnswer, controller, token);
  }
  function buildOn(path: Pathway) {
    setObjective(requested + "\nBuild on the selected pathway: " + path.title +
      "\nPreserve these features: " + path.summary +
      "\nImprove and extend it without starting over.");
    generation.current += 1; abort.current?.abort(); stopVoice();
    setResult(null); setFirstAnswer(""); setPathwaysLoading(false); setPathwayError(""); setStage("idle"); setChoice(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() {
    generation.current += 1; abort.current?.abort(); setObjective(""); setRequested(""); setError(""); setResult(null);
    setFirstAnswer(""); setRefinement(""); setPathwayError(""); setPathwaysLoading(false);
    setStage("idle"); stopVoice(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const choices = result ? [...result.pathways, result.blend] : [];
  return <div className="ascension-world relative isolate mx-auto w-full max-w-none" data-book-sequence={stage === "idle" ? undefined : stage} data-has-run={result ? "true" : undefined}>
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
      Exploring your objective. Waiting for actual model answers…
      <button type="button" className="ml-4 underline" onClick={() => { abort.current?.abort(); setLoading(false); setStage("idle"); stopVoice(); }}>Stop</button>
    </section>}
    {result && <section ref={view} className="ascension-result-reveal mx-auto mt-5 max-w-6xl space-y-5 rounded-xl border border-gold/25 bg-[#020913ed] p-4 sm:p-7" aria-label="ASCENSION result">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gold">ASCENSION · YOUR RESULT</p>
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => { setTalking(!talking); if (talking) stopVoice(); else say(result.introduction); }} className="rounded-full border border-gold/40 px-4 py-2 text-gold">
            {talking ? "Mute Tree" : "Hear Tree"}
          </button>
          <button type="button" onClick={reset} className="rounded-full border border-gold/40 px-4 py-2 text-gold">New objective</button>
        </div>
      </div>
      <p className="text-sm text-foreground/80">{requested}</p>
      <p className="text-base leading-7">{result.introduction}</p>
      <p className="text-sm text-muted-foreground">Contributing models: {result.contributors.join(", ")}.
        {result.unavailable.length > 0 ? " Not connected: " + result.unavailable.join(", ") + "." : ""}
        {result.mode !== "three-provider-synthesis" ? " These are provisional OpenAI pathways, not three independent model answers." : ""}
      </p>
      <div role="tablist" aria-label="Choose an approach" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {choices.map((p, index) => <button type="button" role="tab" aria-selected={choice === index} key={p.id}
          className={"min-h-16 rounded-lg border p-3 text-left text-sm " + (choice === index ? "border-primary bg-primary/15 text-primary" : "border-gold/30 bg-black/30 text-gold")}
          onClick={() => { setChoice(index); if (talking) say(p.title + ". " + p.summary); }}>
          {index === 3 ? "FOURTH · BLEND" : "PATHWAY " + (index + 1)}
          <span className="mt-1 block text-xs text-foreground/85">{p.title}</span>
        </button>)}
      </div>
      <PathwayView key={choices[choice]?.id} path={choices[choice]!} onBuild={buildOn} />
      <p className="border-t border-border/50 pt-4 text-xs leading-6 text-muted-foreground">
        Proposed designs only. Local Meaning Elements, Spiral, Guardian, Outcome Predictor and AutoSync have not verified this hosted result.
        Earlier records are unchanged. This Supabase-free route does not yet save results across devices.
      </p>
    </section>}
  </div>;
}
