import { useEffect, useRef, useState } from "react";
import { TreePathwayCarousel } from "@/components/ascension/tree-pathway-carousel";
import { TreeGuide } from "@/components/ascension/tree-guide";
import { V1HunyuanPathway } from "@/components/ascension/v1-hunyuan-pathway";
import { isPersonalFinanceObjective } from "@/lib/ascension/objective-experience";
import { availableTreeVoice } from "@/lib/ascension/tree-speech";

type Part = { name: string; purpose: string; location: string };
type Pathway = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[] };
type Result = { experience?: "guidance" | "design"; introduction: string; pathways: Pathway[]; blend: Pathway & { blend_reason: string };
  contributors: string[]; unavailable: string[]; providerErrors: string[]; mode: string; verified: false; governance: string; persistence: string };
const SCENE = "/approved-scene/ascension-tree-behind-book-hq.jpg";
const GREETING = "Welcome to ASCENSION. I'm the Tree of Knowledge. Glad you're here. What would you like to create? I'll help you work through it.";

let speechSequence = 0;
let activeUtterance: SpeechSynthesisUtterance | null = null;
async function say(text: string, onStarted?: () => void, onUnavailable?: (message: string) => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  const sequence = ++speechSequence;
  const synth = window.speechSynthesis;
  try { synth.cancel(); } catch { return; }
  const voice = await availableTreeVoice(synth);
  if (sequence !== speechSequence) return;
  if (!voice) {
    onUnavailable?.("A woman's English voice isn't available in this browser yet. The Tree's conversation is still available below.");
    return;
  }
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
    words.voice = voice;
    words.lang = voice.lang;
    words.rate = 1;
    words.pitch = 1;
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
function PathwayView(props: {
  path: Pathway & { blend_reason?: string };
  objective: string;
  modelCache: { current: Map<string, ArrayBuffer> };
  imageCache: { current: Map<string, string> };
  onSpeak: (text: string) => void;
  speakingEnabled: boolean;
  alternatives: Pathway[];
  experience?: "guidance" | "design";
}) {
  if(props.experience==="guidance")return <section className="rounded-2xl border border-gold/30 bg-[#04101cdd] p-4 sm:p-6" aria-label="Selected guidance pathway">
    <h3 className="mb-3 text-xl text-gold">{props.path.title}</h3>
    <p className="mb-4 text-sm leading-6">{props.path.summary}</p>
    <TreeGuide objective={props.objective} pathway={props.path} alternatives={props.alternatives} experience="guidance" introduce enabled={props.speakingEnabled} onSpeak={props.onSpeak}/>
  </section>;
  return <V1HunyuanPathway
    path={props.path} alternatives={props.alternatives} objective={props.objective} modelCache={props.modelCache} imageCache={props.imageCache}
    onSpeak={props.onSpeak} speakingEnabled={props.speakingEnabled} />;
}

/** Hosted Tree entry. The first model answer is backend context, not a public essay. */
export function IndependentEngage() {
  const [objective, setObjective] = useState("");
  const [requested, setRequested] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pathwayError, setPathwayError] = useState("");
  const [refinement, setRefinement] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [orbit, setOrbit] = useState(0);
  const [orbPreview,setOrbPreview]=useState<number|null>(null);
  const [stage, setStage] = useState<"idle" | "processing" | "eruption">("idle");
  const [talking, setTalking] = useState(true);
  const [voiceNotice, setVoiceNotice] = useState("");
  const view = useRef<HTMLElement | null>(null);
  const designView = useRef<HTMLElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const modelCache = useRef(new Map<string, ArrayBuffer>());
  const imageCache = useRef(new Map<string, string>());
  const welcomeStarted = useRef(false);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); stopVoice(); }, []);
  useEffect(() => {
    // Tree and Book remain in place; the Tree speaks without a new entrance scene.
    // When a browser blocks autoplay, retry in the first genuine user interaction.
    const greeting = GREETING;
    let disposed = false;
    const tryWelcome = () => {
      if (disposed || welcomeStarted.current || document.hidden) return;
      void say(greeting, () => { welcomeStarted.current = true; setVoiceNotice(""); }, setVoiceNotice);
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

  async function generatePathways(text: string, controller: AbortController, token: number) {
    setPathwayError("");
    try {
      const response = await fetch("/api/public/ascension/independent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: text, phase: "pathways" }),
        signal: controller.signal,
      });
      const data: Result & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Pathway synthesis did not complete.");
      if (!Array.isArray(data.pathways) || data.pathways.length !== 3 || !data.blend)
        throw new Error("The answer engine did not deliver three pathways and a blend.");
      if (generation.current !== token) return;
      setResult(data);
      setChoice(null);
      if (talking) say(data.experience==="guidance"||isPersonalFinanceObjective(text)?"I've brought together a few ways forward. Hear an orb, then choose the approach you'd like us to work through.":"I've brought your designs together. Choose one and we'll explore how its parts work, or build on it together.");
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
    modelCache.current.clear(); imageCache.current.clear();
    setRequested(text);
    setLoading(true);
    setError("");
    setPathwayError("");
    setResult(null);
    setRefinement("");
    setChoice(null);setOrbPreview(null);
    setStage("processing");
    // ENGAGE is a user action, not a cue for unsolicited voice narration.
    try {
      // Generate the design alternatives directly; do not serialize a separate private essay first.
      await generatePathways(text, controller, token);
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
    if (loading || !requested) return;
    const token = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); setStage("processing"); setPathwayError("");
    void generatePathways(requested, controller, token)
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
    modelCache.current.clear(); imageCache.current.clear();
    setObjective(""); setRequested(""); setError(""); setResult(null);
    setRefinement(""); setPathwayError(""); setLoading(false);
    setStage("idle"); setChoice(null);setOrbit(0);setOrbPreview(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const choices = result ? [...result.pathways, result.blend] : [];
  const selected = choice === null ? null : choices[choice];
  const previewPath = orbPreview === null ? null : choices[orbPreview];
  const spokenPreview = (path: Pathway) => {
    const brief = path.summary.split(/(?<=[.!?])\s+/).slice(0,2).join(" ").trim();
    return path.title + ". " + (brief.length>550?brief.slice(0,550).replace(/\s+\S*$/,"")+"…":brief);
  };
  function hearPathway(index:number) {
    const path=choices[index];if(!path)return;
    setOrbit(index);setOrbPreview(index);setTalking(true);setVoiceNotice("");
    void say(spokenPreview(path),()=>setVoiceNotice(""),setVoiceNotice);
  }


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
    data-realities={choice !== null ? "true" : undefined}>
    {choice === null && !result && <section aria-label="Engage ASCENSION" className="ascension-command">
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
        <h2 className="text-lg text-gold">{result.experience==="guidance"||isPersonalFinanceObjective(requested)?"Explore your possibilities":"Explore your designs"}</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => {
            if (talking) stopVoice();
            else say(selected ? selected.title + ". " + selected.summary : "Your possibilities are ready. Choose an orb, or ask me to help you weigh the choices.");
            setTalking(!talking);
          }} className="rounded-full border border-gold/40 px-4 py-2 text-gold">
            {talking ? "Mute Tree" : "Hear Tree"}
          </button>
          <button type="button" onClick={reset} className="rounded-full border border-gold/40 px-4 py-2 text-gold">New objective</button>
        </div>
      </div>
      <TreePathwayCarousel designs={choices.map(p => ({
        id: p.id, title: p.title, summary: p.summary,
      }))} active={orbit % choices.length} onRotate={index=>{stopVoice();setOrbPreview(null);setOrbit(index);}}
        onOpen={hearPathway} />
      {previewPath && <div className="flex flex-wrap items-center justify-center gap-3" aria-label="Pathway introduction">
        <button type="button" onClick={()=>hearPathway(orbPreview!)}
          className="rounded-full border border-gold/40 px-4 py-2 text-sm text-gold">HEAR AGAIN</button>
        <button type="button" onClick={()=>{stopVoice();setChoice(orbPreview);setRefinement("");}}
          className="rounded-full border border-primary/60 bg-primary/10 px-6 py-3 text-sm text-primary">ENTER PATHWAY</button>
        <details className="w-full text-center text-xs text-foreground/70">
          <summary className="cursor-pointer">Read introduction</summary>
          <p className="mx-auto mt-2 max-w-xl leading-6">{spokenPreview(previewPath)}</p>
        </details>
        {voiceNotice && <p role="status" className="w-full text-center text-sm text-gold">{voiceNotice} You can read the introduction or enter the pathway.</p>}
      </div>}
    </section>}
    {choice === null && <div className="relative z-30 mx-auto max-w-6xl px-4">
      <button type="button" onClick={() => { setTalking(true); void say(GREETING, () => setVoiceNotice(""), setVoiceNotice); }}
        className="rounded-full border border-gold/45 bg-[#051b2a] px-4 py-2 text-sm text-gold">Hear the Tree</button>
      <TreeGuide objective={requested || objective || "Explore an idea with ASCENSION"}
        pathway={{ title: "Your idea", summary: requested || objective, steps: [], parts: [] }}
        experience={isPersonalFinanceObjective(requested)?"guidance":result?.experience??"design"} alternatives={choices} enabled={talking} onSpeak={text => { if (talking) say(text); }} />
      {voiceNotice && <p role="status" className="text-sm text-gold">{voiceNotice}</p>}
    </div>}
    {selected && <section ref={designView} className="ascension-knowledgeverse ascension-result-reveal mx-auto mt-5 min-h-[calc(100svh-3rem)] max-w-6xl space-y-5 p-4 sm:p-7"
      aria-label="Selected pathway design">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => { stopVoice(); setChoice(null); }}
          className="rounded-full border border-gold/50 px-5 py-2 text-sm text-gold">← BACK TO PATHWAYS</button>
      </div>
        <PathwayView key={selected.id} experience={isPersonalFinanceObjective(requested)?"guidance":result?.experience??"design"} path={selected} alternatives={choices} objective={requested} modelCache={modelCache} imageCache={imageCache}
          speakingEnabled={talking}
          onSpeak={text => { if (talking) say(text); }} />
        <section className="rounded-xl border border-gold/25 bg-[#051b2a]/95 p-4 sm:p-6" aria-label="Choose your next step">
          <h3 className="text-lg text-gold">Make this possibility yours</h3>
          {"blend_reason" in selected && <p className="mt-3 text-sm leading-6">{String(selected.blend_reason)}</p>}
          {selected.tradeoffs.length > 0 && <div className="mt-4">
            <h4 className="text-sm font-semibold text-amber-100">What to weigh</h4>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">
              {selected.tradeoffs.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </div>}
          {selected.steps.length > 0 && <div className="mt-4">
            <h4 className="text-sm font-semibold text-sky-100">Your first steps</h4>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6">
              {selected.steps.map((step, index) => <li key={index}>{step}</li>)}
            </ol>
          </div>}
          <p className="mt-4 text-xs text-foreground/70">A proposed direction to explore. Ask the Tree what to check before committing time or money.</p>
        </section>
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
