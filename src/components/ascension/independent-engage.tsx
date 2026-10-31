import { useEffect, useRef, useState } from "react";
import { TreeGuide } from "@/components/ascension/tree-guide";
import { v1AssemblyKind } from "@/components/ascension/v1-model-workbench";
import { V1ModeledPathway } from "@/components/ascension/v1-modeled-pathway";

type Part = { name: string; purpose: string; location: string };
type Pathway = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[] };
type Result = { introduction: string; pathways: Pathway[]; blend: Pathway & { blend_reason: string };
  contributors: string[]; unavailable: string[]; providerErrors: string[]; mode: string; verified: false; governance: string; persistence: string };
const SCENE = "/approved-scene/ascension-tree-behind-book-hq.jpg";

let speechSequence = 0;
let activeUtterance: SpeechSynthesisUtterance | null = null;
function say(text: string, onStarted?: () => void) {
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
    words.onstart = () => onStarted?.();
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
type DesignView = "assembled" | "blueprint" | "dissect";

function PathwayView(props: {
  path: Pathway & {blend_reason?:string};
  objective: string;
  imageCache: {current:Map<string,string>};
  onSpeak: (text:string)=>void;
  speakingEnabled:boolean;
}) {
  const kind=v1AssemblyKind(props.objective,props.path.title,props.path.summary);
  return kind ? <V1ModeledPathway key={props.path.id} path={props.path} objective={props.objective}
    kind={kind} onSpeak={props.onSpeak} speakingEnabled={props.speakingEnabled}/> :
    <ImagePathwayView {...props}/>;
}

/** Unsupported geometry remains an explicitly labeled illustration only. */
function ImagePathwayView({ path, objective, imageCache, onSpeak, speakingEnabled }: {
  path: Pathway & { blend_reason?: string };
  objective: string;
  imageCache: { current: Map<string, string> };
  onSpeak: (text: string) => void;
  speakingEnabled: boolean;
}) {
  const [part, setPart] = useState<Part | null>(null);
  const [panel, setPanel] = useState<"description" | "labels">("description");
  const [mode, setMode] = useState<DesignView>("assembled");
  const [picture, setPicture] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState("");
  const [pictureLoading, setPictureLoading] = useState(true);
  const [pictureAttempt, setPictureAttempt] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const imageKey = JSON.stringify([objective, path.id, path.title, mode]);

  useEffect(() => {
    setPart(null); setPanel("description"); setMode("assembled");
    setScale(1); setRotation(0); setImmersive(false);
  }, [path.id]);
  useEffect(() => {
    const stored = imageCache.current.get(imageKey);
    if (stored) {
      setPicture(stored); setPictureError(""); setPictureLoading(false);
      return;
    }
    const controller = new AbortController();
    setPicture(null); setPictureError(""); setPictureLoading(true);
    void fetch("/api/public/ascension/independent", {
      method: "GET", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("ASCENSION image engine status could not be checked.");
      const capability: { picture_generation_enabled?: boolean } = await response.json();
      if (!capability.picture_generation_enabled)
        throw new Error("ASCENSION's image engine is not connected.");
      return fetch("/api/public/ascension/independent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective, phase: "picture", view: mode, pathway: path }),
        signal: controller.signal,
      });
    }).then(async response => {
      const data: { image_url?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "An invention picture could not be produced.");
      if (!data.image_url || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{4000,12000000}$/i.test(data.image_url))
        throw new Error("The image provider did not return a usable picture.");
      if (!controller.signal.aborted) {
        imageCache.current.set(imageKey, data.image_url);
        setPicture(data.image_url);
      }
    }).catch(cause => {
      if (!controller.signal.aborted)
        setPictureError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (!controller.signal.aborted) setPictureLoading(false); });
    return () => controller.abort();
  }, [path, objective, imageCache, imageKey, mode, pictureAttempt]);

  useEffect(() => {
    if (!pictureError.toLowerCase().includes("rate-limit") || pictureAttempt >= 3) return;
    const timer = window.setTimeout(() => setPictureAttempt(value => value + 1), 35000);
    return () => window.clearTimeout(timer);
  }, [pictureError, pictureAttempt, mode]);

  useEffect(() => {
    if (!immersive) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImmersive(false);
    };
    document.addEventListener("keydown", escape);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", escape);
      document.body.style.overflow = original;
    };
  }, [immersive]);

  const changeView = (next: DesignView) => {
    setMode(next);
    setScale(1);
    setRotation(0);
  };
  const image = (enlarged: boolean) => picture ? <img
    src={picture} alt={mode === "assembled"
      ? "Assembled concept picture of " + path.title
      : mode === "blueprint" ? "Blueprint concept of " + path.title
      : "Exploded concept picture of " + path.title}
    draggable={false}
    className={"mx-auto max-h-full max-w-full object-contain transition-transform " +
      (enlarged ? "h-full" : "h-[min(60vh,560px)]")}
    style={{transform: "scale(" + scale + ") rotate(" + rotation + "deg)"}} /> :
    <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-5 text-center text-sm text-foreground/80"
      role={pictureError ? "alert" : "status"}>
      <p>{pictureError || (pictureLoading ? "Creating the selected " + mode + " view…" : "Picture unavailable.")}</p>
      {pictureError && <button type="button" onClick={() => setPictureAttempt(i => i + 1)}
        className="rounded-full border border-gold/55 px-5 py-2 text-gold">RETRY {mode.toUpperCase()} VIEW</button>}
    </div>;
  const controls = <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Picture inspection controls">
    <button type="button" className="rounded-lg border border-gold/40 px-3 py-2 text-gold" onClick={() => setScale(v => Math.min(4, v * 1.25))}>ZOOM IN</button>
    <button type="button" className="rounded-lg border border-gold/40 px-3 py-2 text-gold" onClick={() => setScale(v => Math.max(0.5, v / 1.25))}>ZOOM OUT</button>
    <button type="button" className="rounded-lg border border-gold/40 px-3 py-2 text-gold" onClick={() => setRotation(v => v - 15)}>ROTATE LEFT</button>
    <button type="button" className="rounded-lg border border-gold/40 px-3 py-2 text-gold" onClick={() => setRotation(v => v + 15)}>ROTATE RIGHT</button>
    <button type="button" className="rounded-lg border border-gold/40 px-3 py-2 text-gold" onClick={() => { setScale(1); setRotation(0); }}>RESET</button>
  </div>;

  return <section className="rounded-2xl border border-gold/35 bg-[#05101de8] p-4 shadow-2xl sm:p-7">
    <h3 className="mb-2 text-lg text-gold">{path.title}</h3>
    <TreeGuide objective={objective} pathway={path} enabled={speakingEnabled} onSpeak={onSpeak}/>
    <p className="mb-5 max-w-4xl leading-7 text-foreground">{path.summary}</p>
    <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Selected pathway views">
      {(["assembled", "blueprint", "dissect"] as const).map(view => <button key={view}
        type="button" aria-pressed={mode === view}
        onClick={() => changeView(view)}
        className={"rounded-xl border px-4 py-2 text-sm " + (mode === view
          ? "border-primary bg-primary/20 text-primary" : "border-gold/35 text-gold")}>
        {view === "assembled" ? "ASSEMBLED" : view === "blueprint" ? "BLUEPRINT" : "DISSECT / EXPLODE"}
      </button>)}
      {mode === "dissect" && <button type="button" onClick={() => changeView("assembled")}
        className="rounded-xl border border-gold/40 px-4 py-2 text-sm text-gold">IMPLODE / REASSEMBLE</button>}
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)]">
      <div className="min-w-0 space-y-3">
        <div className="flex min-h-[330px] items-center justify-center overflow-hidden rounded-xl border border-gold/25 bg-[#051322] sm:min-h-[480px]"
          aria-label="Selected invention picture">
          {image(false)}
        </div>
        {controls}
        {mode === "blueprint" && <p className="text-xs text-foreground/65">
          Blueprint concept. Numerical dimensions and tolerances remain unresolved unless established by the design.
        </p>}
        {mode === "dissect" && <p className="text-xs text-foreground/65">
          Exploded concept illustration. Part alignment is illustrative, not verified physical geometry.
        </p>}
        <button type="button" disabled={!picture} onClick={() => setImmersive(true)}
          className="rounded-xl border border-primary/60 px-5 py-3 text-primary disabled:opacity-40">
          DIVE INTO REALITY
        </button>
      </div>
      <aside className="min-w-0 rounded-xl border border-gold/25 bg-[#08192a] p-4" aria-label="Pathway inspection">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["description", "labels"] as const).map(view => <button type="button" key={view}
            aria-pressed={panel === view} onClick={() => setPanel(view)}
            className={"rounded-lg border px-4 py-2 text-sm " +
              (panel === view ? "border-primary text-primary" : "border-gold/40 text-gold")}>
            {view.toUpperCase()}
          </button>)}
        </div>
        {panel === "description" ? <div className="space-y-4 text-sm leading-6">
          {path.blend_reason && <p className="border-l-2 border-primary pl-3">{path.blend_reason}</p>}
          <p>{path.summary}</p>
          <h4 className="font-semibold text-gold">HOW IT WORKS</h4>
          <ol className="list-decimal space-y-2 pl-5">{path.steps.map((step,i) => <li key={i}>{step}</li>)}</ol>
          {path.tradeoffs.length > 0 && <details><summary className="cursor-pointer text-gold">Engineering limits</summary>
            <ul className="mt-2 list-disc pl-4">{path.tradeoffs.map((t,i) => <li key={i}>{t}</li>)}</ul></details>}
        </div> : <div className="space-y-3" aria-label="Select components">
          {path.parts.length === 0 && <p className="text-sm">No named components returned for this pathway.</p>}
          {path.parts.map((p,i) => <button type="button" key={i}
            aria-pressed={part === p}
            onClick={() => {setPart(p);onSpeak(p.name + ". " + p.purpose + (p.location ? " Located " + p.location : ""));}}
            className="block w-full rounded-lg border border-gold/35 p-3 text-left text-sm text-foreground hover:border-primary">
            {p.name}
          </button>)}
          <div className="min-h-24 rounded-lg border border-primary/25 p-3 text-sm" aria-live="polite">
            {part ? <><strong className="text-gold">{part.name}</strong>
              <p className="mt-2"><b>WHAT / DOES:</b> {part.purpose}</p>
              <p className="mt-2"><b>WHERE:</b> {part.location || "Location not specified."}</p></>
              : <p>Select a named component to see what, where, and what it does.</p>}
          </div>
        </div>}
      </aside>
    </div>
    {immersive && <div role="dialog" aria-modal="true" aria-label="Immersive invention inspection"
      className="fixed inset-0 z-[200] flex flex-col overflow-auto bg-[#020a12] p-4 sm:p-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg text-gold">{path.title} · {mode.toUpperCase()}</h3>
        <button type="button" onClick={() => setImmersive(false)}
          className="rounded-xl border border-gold/60 px-5 py-3 text-gold">CLOSE REALITY VIEW</button>
      </div>
      <div className="min-h-[50vh] flex-1 overflow-hidden rounded-xl border border-gold/30 bg-[#061522]"
        aria-label="Immersive concept preview">{image(true)}</div>
      <div className="mt-3">{controls}</div>
      <p className="mt-2 text-xs text-foreground/70">
        Concept illustration, not a verified 3D mesh. The physical dimensions remain unverified.
      </p>
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
  const view = useRef<HTMLElement | null>(null);
  const designView = useRef<HTMLElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const imageCache = useRef(new Map<string, string>());
  const welcomeStarted = useRef(false);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); stopVoice(); }, []);
  useEffect(() => {
    // Tree and Book remain in place; the Tree speaks without a new entrance scene.
    // When a browser blocks autoplay, retry in the first genuine user interaction.
    const greeting = "Welcome to ASCENSION. I'm the Tree of Knowledge. Glad you're here. What would you like to create? I'll help you work through it.";
    let disposed = false;
    const tryWelcome = () => {
      if (disposed || welcomeStarted.current || document.hidden) return;
      say(greeting, () => { welcomeStarted.current = true; });
    };
    const attempt = window.setTimeout(tryWelcome, 280);
    window.addEventListener("pointerdown", tryWelcome, { capture: true });
    window.addEventListener("keydown", tryWelcome, { capture: true });
    return () => {
      disposed = true;
      window.clearTimeout(attempt);
      window.removeEventListener("pointerdown", tryWelcome, { capture: true });
      window.removeEventListener("keydown", tryWelcome, { capture: true });
    };
  }, []);

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
      // The results speak for themselves. Do not narrate the screen.
      setStage("idle"); // Restore the unchanged Tree and Book after ENGAGE; no eruption scene.
      // The backend analysis is not read to the user.
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
    imageCache.current.clear();
    setRequested(text);
    setLoading(true);
    setError("");
    setPathwayError("");
    setResult(null);
    setFirstAnswer("");
    setRefinement("");
    setChoice(null);
    setStage("processing");
    // ENGAGE is a user action, not a cue for unsolicited voice narration.
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
    imageCache.current.clear();
    setObjective(""); setRequested(""); setError(""); setResult(null);
    setFirstAnswer(""); setRefinement(""); setPathwayError(""); setLoading(false);
    setStage("idle"); setChoice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const choices = result ? [...result.pathways, result.blend] : [];
  const selected = choice === null ? null : choices[choice];

  // Move the viewport only after React has mounted the destination screen.
  // The previous scrollTo inside the click ran before the cards disappeared.
  useEffect(() => {
    if (!result) return;
    const frame = window.requestAnimationFrame(() => {
      (choice === null ? view.current : designView.current)?.scrollIntoView({
        behavior: "instant", block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [choice]);

  return <div className="ascension-world relative isolate mx-auto w-full max-w-none"
    data-book-sequence={stage === "idle" ? undefined : stage} data-has-run={result ? "true" : undefined}
    data-realities={result ? "true" : undefined}>
    {!result && <section aria-label="Engage ASCENSION" className="ascension-command">
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
    </section>}

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

    {result && choice === null && <section ref={view} className="ascension-result-reveal mx-auto mt-5 max-w-6xl space-y-5 rounded-xl border border-gold/25 bg-[#020913ed] p-4 sm:p-7" aria-label="ASCENSION pathways">
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
        {choices.map((p, index) => <button type="button" role="tab" aria-selected={false}
          key={p.id} className={"min-h-40 rounded-xl border p-4 text-left transition-colors " +
            (choice === index ? "border-primary bg-primary/15 text-primary" : "border-gold/30 bg-black/30 text-gold")}
          onClick={() => {
            setChoice(index); setRefinement("");
            // The mounted design screen receives the viewport on the next frame.
          }}>
          <span className="block text-xs tracking-wide">{index === 3 ? "FOURTH · BLEND" : "PATHWAY " + (index + 1)}</span>
          <strong className="mt-2 block text-base text-foreground">{p.title}</strong>
          <span className="mt-3 block text-sm leading-6 text-foreground/80">
            {p.summary.length > 190 ? p.summary.slice(0, 187).trimEnd() + "…" : p.summary}
          </span>
        </button>)}
      </div>
    </section>}
    {selected && <section ref={designView} className="ascension-result-reveal mx-auto mt-5 min-h-[calc(100svh-3rem)] max-w-6xl space-y-5 p-4 sm:p-7"
      aria-label="Selected pathway design">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => { stopVoice(); setChoice(null); }}
          className="rounded-full border border-gold/50 px-5 py-2 text-sm text-gold">← BACK TO PATHWAYS</button>
      </div>
        <PathwayView key={selected.id} path={selected} objective={requested} imageCache={imageCache}
          speakingEnabled={talking}
          onSpeak={text => { if (talking) say(text); }} />
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
    </section>}
  </div>;
}
