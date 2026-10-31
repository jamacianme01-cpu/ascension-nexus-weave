import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ObjectivePathway } from "@/lib/ascension/result-model";
import type { DesignPart } from "@/lib/ascension/parts-model";
import { TreeGuide } from "@/components/ascension/tree-guide";

const RealityViewer = lazy(() => import("@/components/ascension/RealityViewer").then(mod => ({ default: mod.RealityViewer })));

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
function PathwayView({ path, objective, onDive, imageCache, onSpeak, speakingEnabled }: {
  path: Pathway & { blend_reason?: string };
  objective: string;
  onDive: (path: Pathway, imageUrl: string, mode?: "cutaway" | "blueprint" | "dissect") => void;
  imageCache: { current: Map<string, string> };
  onSpeak: (text: string) => void;
  speakingEnabled: boolean;
}) {
  const [part, setPart] = useState<Part | null>(null);
  const [panel, setPanel] = useState<"description" | "labels">("description");
  const [picture, setPicture] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState("");
  const [pictureLoading, setPictureLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  useEffect(() => { setPart(null); setPanel("description"); }, [path.id]);
  useEffect(() => {
    const cacheKey = JSON.stringify([objective, path.id, path.title]);
    const stored = imageCache.current.get(cacheKey);
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
        body: JSON.stringify({ objective, phase: "picture", pathway: path }),
        signal: controller.signal,
      });
    }).then(async response => {
      const data: { image_url?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "An invention picture could not be produced.");
      if (!data.image_url || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{4000,12000000}$/i.test(data.image_url))
        throw new Error("The image provider did not return a usable picture.");
      if (!controller.signal.aborted) {
        imageCache.current.set(cacheKey, data.image_url);
        setPicture(data.image_url);
      }
    }).catch(cause => {
      if (!controller.signal.aborted)
        setPictureError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (!controller.signal.aborted) setPictureLoading(false); });
    return () => controller.abort();
  }, [path, objective, imageCache]);
  return <section className="rounded-2xl border border-gold/35 bg-[#05101de8] p-5 shadow-2xl sm:p-7">
    <h3 className="mb-3 text-lg text-gold">{path.title}</h3>
    <TreeGuide objective={objective} pathway={path} enabled={speakingEnabled} onSpeak={onSpeak} />
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Selected pathway views">
      {(["description", "labels"] as const).map(tab =>
        <button key={tab} type="button" aria-pressed={panel === tab}
          onClick={() => { setPanel(tab); onSpeak(tab === "description" ? path.summary.slice(0, 260) : "Choose a named component to learn what it does and where it belongs."); }}
          className="rounded-full border border-gold/50 px-4 py-2 text-sm text-gold">{tab.toUpperCase()}</button>)}
      <button type="button" disabled={!picture} onClick={() => picture && onDive(path, picture, "blueprint")}
        className="rounded-full border border-gold/50 px-4 py-2 text-sm text-gold disabled:opacity-40">BLUEPRINT</button>
      <button type="button" disabled={!picture} onClick={() => picture && onDive(path, picture, "dissect")}
        className="rounded-full border border-gold/50 px-4 py-2 text-sm text-gold disabled:opacity-40">DISSECT / EXPLODE</button>
    </div>
    <div className="mb-5 rounded-xl border border-gold/25 bg-[#08192a] p-3" aria-label="Selected invention picture">
      {picture ? <>
        <div className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-lg bg-black/40 sm:min-h-[440px]">
          <img src={picture} alt={`Concept picture of ${path.title}`}
            className="max-h-[70vh] w-full object-contain transition-transform"
            style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rounded-full border border-gold/45 px-4 py-2 text-sm text-gold"
            onClick={() => setScale(v => Math.min(4, v * 1.25))}>ZOOM IN</button>
          <button type="button" className="rounded-full border border-gold/45 px-4 py-2 text-sm text-gold"
            onClick={() => setScale(v => Math.max(0.5, v / 1.25))}>ZOOM OUT</button>
          <button type="button" className="rounded-full border border-gold/45 px-4 py-2 text-sm text-gold"
            onClick={() => setRotation(v => v - 15)}>ROTATE LEFT</button>
          <button type="button" className="rounded-full border border-gold/45 px-4 py-2 text-sm text-gold"
            onClick={() => setRotation(v => v + 15)}>ROTATE RIGHT</button>
          <button type="button" className="rounded-full border border-gold/45 px-4 py-2 text-sm text-gold"
            onClick={() => { setScale(1); setRotation(0); }}>RESET VIEW</button>
          <button type="button" className="rounded-full border border-primary/60 px-5 py-2 text-sm text-primary"
            onClick={() => onDive(path, picture)}>DIVE INTO REALITY</button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Actual generated concept artwork. No verified 3D mesh is available yet; 3D editing requires a reconstructed model.</p>
      </> : <p className="p-6 text-center text-sm text-muted-foreground" role={pictureError ? "alert" : "status"}>
        {pictureError || (pictureLoading ? "Creating the selected invention picture…" : "Invention picture unavailable.")}
      </p>}
    </div>
    {panel === "description" && <>
    <p className="mb-5 max-w-3xl leading-7 text-foreground">{path.summary}</p>
    {path.blend_reason && <p className="mb-4 border-l-2 border-primary pl-4 text-sm text-foreground/85">{path.blend_reason}</p>}
    <h4 className="mb-2 text-sm font-semibold text-primary">How this approach works</h4>
    <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm leading-6">
      {path.steps.map((step, i) => <li key={i}>{step}</li>)}
    </ol>
    </>}
    {panel === "labels" && (path.parts.length > 0 ? <div className="mb-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-2" aria-label="Select components">
        <h4 className="text-sm font-semibold text-primary">Components — select to inspect</h4>
        {path.parts.map((p, i) => <button type="button" key={i} onClick={() => {setPart(p); onSpeak(p.name + ". " + p.purpose + (p.location ? " Location: " + p.location : ""));}}
          className="block w-full rounded-lg border border-gold/30 bg-black/25 p-3 text-left text-sm hover:border-gold">
          {p.name}</button>)}
      </div>
      <div className="min-h-40 rounded-xl border border-primary/25 bg-[#08192a] p-5">
        {part ? <><h4 className="mb-2 text-gold">{part.name}</h4><p className="mb-3 text-sm">{part.purpose}</p>
          {part.location && <p className="text-xs text-muted-foreground">Location / relationship: {part.location}</p>}</>
          : <p className="text-sm text-muted-foreground">Select a component to see what it does and where it belongs.</p>}
        <p className="mt-4 text-xs text-muted-foreground">Part descriptions are conceptual; dimensions are unresolved unless independently established.</p>
      </div>
    </div> : <p role="status" className="text-sm text-muted-foreground">This pathway did not specify named components.</p>)}
    {panel === "description" && path.tradeoffs.length > 0 && <details className="mb-5 text-sm text-muted-foreground">
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
  const [dive, setDive] = useState<{ pathway: Pathway; imageUrl: string; mode: "cutaway" | "blueprint" | "dissect" } | null>(null);
  const [stage, setStage] = useState<"idle" | "processing" | "eruption">("idle");
  const [talking, setTalking] = useState(true);
  const view = useRef<HTMLElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const imageCache = useRef(new Map<string, string>());
  const welcomeStarted = useRef(false);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); stopVoice(); }, []);
  useEffect(() => {
    // Tree and Book remain in place; the Tree speaks without a new entrance scene.
    // When a browser blocks autoplay, retry in the first genuine user interaction.
    const greeting = "Welcome to ASCENSION. You're entering a world where knowledge connects and ideas become possibilities. I'm here to explore those connections with you. What would you like to accomplish?";
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
      if (talking && data.introduction?.trim()) say(data.introduction.trim().slice(0, 260));
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
    setDive(null);
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
    imageCache.current.clear();
    setObjective(""); setRequested(""); setError(""); setResult(null);
    setFirstAnswer(""); setRefinement(""); setPathwayError(""); setLoading(false);
    setStage("idle"); setChoice(null); setDive(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const choices = result ? [...result.pathways, result.blend] : [];
  const selected = choice === null ? null : choices[choice];

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
            window.scrollTo(0, 0);
            if (talking) say(p.title + ". " + p.summary.slice(0, 230));
          }}>
          <span className="block text-xs tracking-wide">{index === 3 ? "FOURTH · BLEND" : "PATHWAY " + (index + 1)}</span>
          <strong className="mt-2 block text-base text-foreground">{p.title}</strong>
          <span className="mt-3 block text-sm leading-6 text-foreground/80">
            {p.summary.length > 190 ? p.summary.slice(0, 187).trimEnd() + "…" : p.summary}
          </span>
        </button>)}
      </div>
    </section>}
    {selected && <section className="ascension-result-reveal mx-auto mt-5 min-h-[calc(100svh-3rem)] max-w-6xl space-y-5 p-4 sm:p-7"
      aria-label="Selected pathway design">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => { stopVoice(); setDive(null); setChoice(null); window.scrollTo(0, 0); }}
          className="rounded-full border border-gold/50 px-5 py-2 text-sm text-gold">← BACK TO PATHWAYS</button>
      </div>
        <PathwayView key={selected.id} path={selected} objective={requested} imageCache={imageCache}
          onDive={(pathway, imageUrl, mode = "cutaway") => { stopVoice(); setDive({ pathway, imageUrl, mode }); }}
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
        objective={requested} requestId={null} initialMode={dive.mode === "blueprint" ? "blueprint" : "cutaway"}
        v1InitialDissected={dive.mode === "dissect"}
        treeGuide={<TreeGuide objective={requested}
          pathway={dive.pathway} compact enabled={talking}
          onSpeak={text => { if (talking) say(text); }} />}
        v1Parts={dive.pathway.parts.map((part): DesignPart => ({
          name: part.name, purpose: part.purpose, location: part.location,
          operation: part.purpose,
          connections: "Connections have not been specified.",
          limitations: "Unverified concept; precise mechanical dimensions and location are not supplied.",
          x: -1, y: -1,
        }))}
        onV1PartSelected={part => { if (talking) say(part.name + '. ' + part.purpose + ' ' + part.location); }}
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
