import { useEffect, useRef, useState } from "react";
import { PathwayStage, PATH_STYLES, SpiralBoard } from "@/components/ascension/spiral-flow";

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
    if (talking) say(text);
  }
  function toggleTalking() {
    if (talking) { stopVoice(); setTalking(false); }
    else {
      setTalking(true);
      say("I'm here if a suggestion would help.");
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
      offer("Four ways are here. Any of them can be opened if a closer look would help.");
      setStage("idle");
      window.setTimeout(() => {
        if (generation.current === token) view.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === token) {
        setPathwayError(cause instanceof Error ? cause.message : String(cause));
        offer("The pathways didn't finish. Trying again is there whenever you want it.");
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
        offer("That didn't connect. The book can wait for another intention.");
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
        {loading && <p className="ascension-tree-status" role="status">
          {!talking && "Looking at a few different ways this could go. "}
          <button type="button" onClick={() => {
            generation.current += 1; abort.current?.abort(); stopVoice();
            setLoading(false); setStage("idle");
            offer("Stopped. The book can wait until you want to try again.");
          }}>Stop</button>
        </p>}
        {error && <p role="alert">{error}</p>}
        {!loading && pathwayError && <p role="alert">
          Pathways could not be completed: {pathwayError}
          <button type="button" onClick={retryPathways}>Retry pathways</button>
        </p>}
      </div>
    </section>

    {result && !dive && <div ref={view}>
      <SpiralBoard
        pathways={choices}
        talking={talking}
        onToggleTalking={toggleTalking}
        onReset={reset}
        onOpen={(index) => {
          const path = choices[index];
          if (!path) return;
          const style = PATH_STYLES[index];
          setChoice(index);
          offer(`${style?.name ?? path.title}. This is one way it might come together. Assembled is here, and the parts can be opened if you want a closer look.`);
          setDive({ pathway: path, imageUrl: "" });
        }}
      />
    </div>}
    {dive && <PathwayStage
      pathway={dive.pathway}
      variant={choice ?? 0}
      talking={talking}
      onClose={() => setDive(null)}
      onGuide={offer}
    />}
  </div>;
}
