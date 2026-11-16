import { useEffect, useRef, useState } from "react";
import { DesignedFlow, type DesignedScreen, type DesignedTarget, type PathwayReading } from "@/components/ascension/designed-flow";

type Part = { name: string; purpose: string; location: string };
type Pathway = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[]; blend_reason?: string };
type Result = { introduction: string; pathways: Pathway[]; blend: Pathway & { blend_reason: string } };
type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};

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
  const phrase = text.replace(/\s+/g, " ").trim().split(/[.!?]/)[0]?.trim() ?? "";
  return phrase.length <= 28 ? phrase : "";
}

function guideFor(result: Result): string {
  const intro = result.introduction.replace(/\b(ChatGPT|OpenAI|Claude|Grok)\b/gi, "").replace(/\s+/g, " ").trim();
  if (intro.length > 40 && intro.length < 320) return intro;
  const [first, second, third] = result.pathways;
  return `Three readings came back: ${first?.title}, ${second?.title}, and ${third?.title}. The fourth is a blend, ${result.blend.title}. Any of them can be opened if a closer look would help.`;
}

function openLine(path: Pathway, blend: boolean): string {
  const detail = sentence(blend ? path.blend_reason || path.summary : path.summary);
  if (blend) return `This fourth one is the blend. ${path.title}. ${detail}`;
  return `${path.title}. ${detail} The other views are there if a closer look would help.`;
}

/** Hosted Tree entry. Engines analyze the answer; the fourth pathway is the blend. */
export function IndependentEngage() {
  const [objective, setObjective] = useState("");
  const [category, setCategory] = useState<"Business Planner" | "Build / Create" | "Guidance" | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const recognition = useRef<{ stop: () => void } | null>(null);
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
    if (!category || welcomed.current) return;
    welcomed.current = true;
    if (talking) say(WELCOME + " Speak your objective when you are ready.");
  }, [category, talking]);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); recognition.current?.stop(); stopVoice(); }, []);

  function listenForObjective() {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const browser = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("This browser does not support speech recognition. Use a browser with speech input to speak your objective.");
      return;
    }
    stopVoice();
    setVoiceError("");
    const listener = new Recognition();
    recognition.current = listener;
    listener.lang = "en-US";
    listener.continuous = false;
    listener.interimResults = false;
    listener.onresult = event => {
      const spoken = event.results[0]?.[0]?.transcript?.trim();
      if (spoken) setObjective(spoken.slice(0, 2400));
    };
    listener.onerror = event => { setVoiceError("Speech recognition: " + event.error); setListening(false); };
    listener.onend = () => { setListening(false); recognition.current = null; };
    try { listener.start(); setListening(true); } catch { setVoiceError("Microphone could not start."); setListening(false); }
  }

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
    if (!category || text.length < 3 || loading) return;
    const token = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError("");
    setResult(null);
    setScreen(null);
    setChoice(0);
    offer("I'm with you. I'll read this and bring back a few ways it could come together.");
    try {
      const initial = await fetch("/api/public/ascension/independent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: text, category, phase: "initial" }),
        signal: controller.signal,
      });
      const first: { answer?: string; error?: string } = await initial.json();
      if (!initial.ok) throw new Error(first.error || "The reading didn't finish.");
      if (!first.answer?.trim()) throw new Error("The reading didn't finish.");
      if (generation.current !== token) return;
      const pathways = await fetch("/api/public/ascension/independent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: text, category, phase: "pathways", firstAnswer: first.answer.slice(0, 6000) }),
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
        const quiet = /not configured|unavailable|did not respond/i.test(message)
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
      choice === 3,
    ));
    else if (next === "blueprint") offer("The blueprint is this same reading, drawn out, if that view would help.");
    else if (next === "dissect") offer("This opens the same reading so the parts can be seen.");
    else if (next === "exploded") offer("The parts are set apart here, if seeing them separately would help.");
    else if (next === "imploded") offer("The parts can come back together from here.");
    else if (next === "spiral") offer("The four readings are still here. The fourth is the blend, if you want to compare them.");
    setScreen(next);
  }

  function openPathway(index: number) {
    const path = index === 3 ? result?.blend : result?.pathways[index];
    if (!path) return;
    setChoice(index);
    offer(openLine(path, index === 3));
    setScreen("assembled");
  }

  return <div className="ascension-world relative isolate mx-auto w-full max-w-none">
    <section aria-label="Engage ASCENSION" className="ascension-command" hidden={screen !== null}>
      <div className="ascension-stage">
        <div className="ascension-scene-hero" aria-hidden="true">
          <img className="ascension-tree-scene" src={SCENE} alt="" draggable={false} />
        </div>
        {!category ? (
          <div role="group" aria-label="Choose a Book category" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/70 px-4">
            <h1 className="font-serif text-3xl text-amber-200">ASCENSION</h1>
            <div className="flex flex-wrap justify-center gap-4">
              {(["Business Planner", "Build / Create", "Guidance"] as const).map(option =>
                <button key={option} type="button" className="min-h-16 rounded-xl border border-amber-400/60 bg-black/85 px-6 text-amber-100"
                  onClick={() => { setCategory(option); setObjective(""); setError(""); }}>{option}</button>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute bottom-[22%] left-1/2 z-20 flex w-[min(90%,38rem)] -translate-x-1/2 flex-col items-center gap-3 text-center">
            <span className="text-sm text-amber-200">{category}</span>
            <button type="button" onClick={listenForObjective} disabled={loading}
              className="min-h-12 rounded-full border border-amber-400/70 bg-black/85 px-5 text-amber-100">
              {listening ? "STOP LISTENING" : "SPEAK OBJECTIVE"}
            </button>
            <p role="status" aria-live="polite" className="max-h-24 overflow-auto rounded-lg bg-black/85 px-3 py-2 text-sm text-white">
              {objective || (listening ? "Listening…" : "Your spoken objective will appear here.")}
            </p>
            {voiceError && <p role="alert" className="text-sm text-red-200">{voiceError}</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={!category || loading || objective.trim().length < 3} onClick={() => void engage()}
            className="ascension-engage min-h-12 rounded-full border border-gold/55 bg-gold/10 px-7 text-sm font-medium tracking-wide text-gold">
            {loading ? "ENGAGING ASCENSION…" : "ENGAGE ASCENSION"}
          </button>
        </div>
        {loading && <p className="ascension-tree-status" role="status">
          Reading this with you.
          <button type="button" onClick={stop}>Stop</button>
        </p>}
        {error && <p className="ascension-tree-status" role="status">{error}</p>}
        {category && <button type="button" onClick={toggleTalking} aria-pressed={!talking} className="ascension-tree-hear">
          {talking ? "MUTE TREE" : "HEAR TREE"}
        </button>}
      </div>
    </section>
    {screen && result && <DesignedFlow screen={screen} readings={readings} talking={talking} onToggleTalking={toggleTalking} onScreen={show} onOpen={openPathway} />}
  </div>;
}
