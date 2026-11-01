import { useEffect, useRef, useState } from "react";
import { DesignedFlow, type DesignedScreen, type DesignedTarget } from "@/components/ascension/designed-flow";

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

/** Hosted Tree entry. The designed screens follow the opening. */
export function IndependentEngage() {
  const [objective, setObjective] = useState("");
  const [screen, setScreen] = useState<DesignedScreen | null>(null);
  const [talking, setTalking] = useState(true);
  const welcomed = useRef(false);
  useEffect(() => {
    if (welcomed.current) return;
    welcomed.current = true;
    say(WELCOME);
  }, []);
  useEffect(() => () => stopVoice(), []);
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
  function engage() {
    if (objective.trim().length < 3) return;
    setScreen("spiral");
    offer("Four ways are here. Any of them can be opened if a closer look would help.");
  }
  function show(next: DesignedTarget) {
    if (next === "book") {
      setScreen(null);
      return;
    }
    if (screen === "spiral" && next === "assembled") {
      offer("Assembled is here. The other views are along the bottom if a closer look would help.");
    }
    setScreen(next);
  }

  return <div className="ascension-world relative isolate mx-auto w-full max-w-none">
    <section aria-label="Engage ASCENSION" className="ascension-command" hidden={screen !== null}>
      <div className="ascension-stage">
        <div className="ascension-scene-hero" aria-hidden="true">
          <img className="ascension-tree-scene" src={SCENE} alt="" draggable={false} />
        </div>
        <label htmlFor="objective">What do you want to accomplish?</label>
        <textarea id="objective" rows={3} value={objective} maxLength={2400}
          aria-label="What do you want to accomplish?" placeholder="Type your intention..."
          onChange={event => setObjective(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); engage(); } }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={objective.trim().length < 3} onClick={engage}
            className="ascension-engage min-h-12 rounded-full border border-gold/55 bg-gold/10 px-7 text-sm font-medium tracking-wide text-gold">
            ENGAGE ASCENSION
          </button>
        </div>
        <button type="button" onClick={toggleTalking} aria-pressed={!talking} className="ascension-tree-hear">
          {talking ? "MUTE TREE" : "HEAR TREE"}
        </button>
      </div>
    </section>
    {screen && <DesignedFlow screen={screen} onScreen={show} />}
  </div>;
}
