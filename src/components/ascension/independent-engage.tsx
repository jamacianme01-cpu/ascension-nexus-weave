import { useEffect, useRef, useState } from "react";
import { DesignedFlow, type DesignedScreen, type DesignedTarget, type PathwayReading } from "@/components/ascension/designed-flow";

type Part = { name: string; purpose: string; location: string };
type Pathway = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[]; blend_reason?: string };
type Result = { introduction: string; pathways: Pathway[]; blend: Pathway & { blend_reason: string } };

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

function sentence(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const end = cleaned.search(/[.!?](\s|$)/);
  const line = end >= 0 ? cleaned.slice(0, end + 1) : cleaned;
  return line.length > 140 ? line.slice(0, 137).trim() + "…" : line;
}

function cardLine(text: string): string {
  const phrase = sentence(text);
  return phrase.length <= 140 ? phrase : phrase.slice(0, 137).trim() + "…";
}

function guideFor(result: Result): string {
  const first = result.pathways[0];
  if (!first) return "The readings are here.";
  return `${first.title}. ${sentence(first.summary)}`;
}

function openLine(path: Pathway): string {
  return `${path.title}. ${sentence(path.summary)}`;
}

/** Hosted Tree entry. Engines analyze the answer; the fourth pathway is the blend. */
export function IndependentEngage() {
  const [objective, setObjective] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [screen, setScreen] = useState<DesignedScreen | null>(null);
  const [choice, setChoice] = useState(0);
  const [talking, setTalking] = useState(true);
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

  async function engage() {
    const text = objective.trim();
    if (text.length < 3 || loading) return;
    const token = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError("");
    setResult(null);
    setScreen(null);
    setChoice(0);
    offer("Reading your sentence.");
    try {
      const pathways = await fetch("/api/public/ascension/independent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: text, phase: "pathways" }),
        signal: controller.signal,
      });
      const data: Result & { error?: string } = await pathways.json();
      if (!pathways.ok) throw new Error(data.error || "The pathways didn't finish.");
      if (!Array.isArray(data.pathways) || data.pathways.length !== 3 || !data.blend?.title)
        throw new Error("The pathways didn't finish.");
      if (generation.current !== token) return;
      setResult(data);
      setScreen("spiral");
      offer(guideFor(data));
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === token) {
        const message = cause instanceof Error ? cause.message : String(cause);
        const quiet = /not configured|unavailable|did not respond|not connected|no answer engine|unreachable/i.test(message)
          ? "The reading engines aren't connected from here, so I don't have that analysis yet. The book can wait if you want to try again."
          : "That reading didn't finish. The book can wait if you want to try again.";
        setError(quiet);
        offer(quiet);
      }
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }

  function stop() {
    generation.current += 1;
    abort.current?.abort();
    setLoading(false);
    offer("Stopped. The book can wait until you want to try again.");
  }

  const readings: PathwayReading[] = result
    ? [...result.pathways, result.blend].map((path, index) => ({
        title: path.title,
        line: cardLine(path.summary),
        blend: index === 3,
        parts: path.parts ?? [],
      }))
    : [];

  function show(next: DesignedTarget) {
    if (next === "book") {
      setScreen(null);
      offer("The book is here whenever another reading would help.");
      return;
    }
    const selected = readings[choice];
    if (next === "assembled" && selected) offer(openLine(
      choice === 3 ? result!.blend : result!.pathways[choice]!,
    ));
    else if (next === "blueprint") offer("Blueprint. Same reading, drawn as parts.");
    else if (next === "dissect") offer("Dissect. The named parts, apart.");
    else if (next === "exploded") offer("Exploded. The named parts, separated.");
    else if (next === "imploded") offer("Imploded. The named parts, back together.");
    else if (next === "spiral") offer(guideFor(result!));
    setScreen(next);
  }

  function openPathway(index: number) {
    const path = index === 3 ? result?.blend : result?.pathways[index];
    if (!path) return;
    setChoice(index);
    offer(openLine(path));
    setScreen("assembled");
  }

  return <div className="ascension-world relative isolate mx-auto w-full max-w-none">
    <section aria-label="Engage ASCENSION" className="ascension-command" hidden={screen !== null}>
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
        {loading && <p className="ascension-tree-status" role="status">
          Reading this with you.
          <button type="button" onClick={stop}>Stop</button>
        </p>}
        {error && <p className="ascension-tree-status" role="status">{error}</p>}
        <button type="button" onClick={toggleTalking} aria-pressed={!talking} className="ascension-tree-hear">
          {talking ? "MUTE TREE" : "HEAR TREE"}
        </button>
      </div>
    </section>
    {screen && result && <DesignedFlow screen={screen} objective={objective.trim()} readings={readings} choice={choice} talking={talking} onToggleTalking={toggleTalking} onScreen={show} onOpen={openPathway} />}
  </div>;
}
