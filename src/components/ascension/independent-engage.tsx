import { useEffect, useRef, useState } from "react";
import { DesignedFlow, type DesignedScreen, type DesignedTarget, type PathwayReading } from "@/components/ascension/designed-flow";
import { submitGuestObjective, getGuestObjectiveStatus, getGuestObjectiveDelivery } from "@/lib/ascension/guest.functions";
import type { ObjectiveDelivery } from "@/lib/ascension/result-model";

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

function fromGovernedDelivery(delivery: ObjectiveDelivery): Result | null {
  if (delivery.pathways.length !== 3 || !delivery.blend) return null;
  const toPath = (path: ObjectiveDelivery["pathways"][number]): Pathway => ({
    id: path.id, title: path.label, summary: path.summary,
    steps: path.steps, tradeoffs: path.tradeoffs, parts: [],
  });
  const pathways = delivery.pathways.map(toPath);
  const blend = { ...toPath(delivery.blend), blend_reason: delivery.blend.blend_reason };
  if (new Set(pathways.map(path => path.id)).size !== 3 ||
      pathways.some(path => !path.title.trim() || !path.summary.trim()) ||
      !blend.title.trim() || !blend.summary.trim()) return null;
  return { introduction: delivery.body, pathways, blend };
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
  const [microphone, setMicrophone] = useState<"checking" | "ready" | "unavailable">("checking");
  const [textBackup, setTextBackup] = useState(false);
  const [microphonePrompt, setMicrophonePrompt] = useState(false);
  const objectiveRef = useRef("");
  const categoryRef = useRef<typeof category>(null);
  const engageRef = useRef<() => void>(() => {});
  const listeningRef = useRef(false);
  const speechAllowedRef = useRef(true);
  const recognition = useRef<{ stop: () => void } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [internalKnowledge, setInternalKnowledge] = useState("");
  const [governedStatus, setGovernedStatus] = useState("");
  const governedWatch = useRef<ReturnType<typeof setInterval> | null>(null);
  const [screen, setScreen] = useState<DesignedScreen | null>(null);
  const [choice, setChoice] = useState(0);
  const [talking, setTalking] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const welcomed = useRef(false);

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);
  useEffect(() => { objectiveRef.current = objective; }, [objective]);
  useEffect(() => {
    if (!category || welcomed.current) return;
    welcomed.current = true;
    if (talking) say(WELCOME + " Speak your objective when you are ready.");
  }, [category, talking]);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); recognition.current?.stop(); if (governedWatch.current) clearInterval(governedWatch.current); stopVoice(); }, []);

  useEffect(() => {
    let closed = false;
    const getMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!getMedia) {
      setMicrophone("unavailable");
      setTextBackup(true);
      return;
    }
    // Request permission at entry. Some browsers require a user gesture;
    // the explicit browser-access button is retained for those browsers.
    setMicrophonePrompt(true);
    void getMedia({ audio: true }).then(stream => {
      stream.getTracks().forEach(track => track.stop());
      if (closed) return;
      setMicrophone("ready");
      setMicrophonePrompt(false);
      listenForObjective(true);
    }).catch(() => {
      if (closed) return;
      setMicrophone("unavailable");
      setTextBackup(true);
      setMicrophonePrompt(false);
    });
    return () => { closed = true; };
  }, []);

  function chooseCategory(next: "Business Planner" | "Build / Create" | "Guidance") {
    categoryRef.current = next;
    setCategory(next);
    setObjective("");
    objectiveRef.current = "";
    setError("");
  }

  function handleVoice(text: string) {
    const spoken = text.trim();
    const normalized = spoken.toLowerCase().replace(/[.,!?]/g, "").trim();
    if (!spoken) return;
    if (normalized === "business planner" || normalized === "business") {
      chooseCategory("Business Planner"); return;
    }
    if (normalized === "build create" || normalized === "build" || normalized === "build and create") {
      chooseCategory("Build / Create"); return;
    }
    if (normalized === "guidance") { chooseCategory("Guidance"); return; }
    if (normalized === "engage" || normalized === "engage ascension") {
      engageRef.current();
      return;
    }
    if (normalized === "stop" || normalized === "stop listening") {
      recognition.current?.stop();
      return;
    }
    if (categoryRef.current) {
      objectiveRef.current = spoken.slice(0, 2400);
      setObjective(objectiveRef.current);
    }
  }

  function listenForObjective(auto = false) {
    if (listeningRef.current) {
      if (!auto) { recognition.current?.stop(); listeningRef.current = false; setListening(false); }
      return;
    }
    const browser = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("Speech recognition is unavailable in this browser. Use the text backup.");
      setTextBackup(true);
      return;
    }
    stopVoice();
    setVoiceError("");
    const listener = new Recognition();
    recognition.current = listener;
    listener.lang = "en-US";
    listener.continuous = true;
    listener.interimResults = false;
    listener.onresult = event => {
      const latest = Array.from(event.results).at(-1);
      const spoken = latest?.[0]?.transcript?.trim();
      if (spoken) handleVoice(spoken);
    };
    listener.onerror = event => {
      setVoiceError("Speech recognition: " + event.error);
      listeningRef.current = false;
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setTextBackup(true);
    };
    listener.onend = () => {
      listeningRef.current = false;
      setListening(false);
      recognition.current = null;
    };
    try { listener.start(); listeningRef.current = true; setListening(true); }
    catch { setVoiceError("Microphone could not start. Use text backup."); setTextBackup(true); setListening(false); }
  }

  async function requestMicrophone() {
    const getMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!getMedia) { setTextBackup(true); return; }
    try {
      const stream = await getMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicrophone("ready");
      setVoiceError("");
      setTextBackup(false);
      listenForObjective(true);
    } catch {
      setMicrophone("unavailable");
      setTextBackup(true);
    }
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
    const text = objectiveRef.current.trim();
    if (!categoryRef.current || text.length < 3 || loading) return;
    const token = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    if (governedWatch.current) clearInterval(governedWatch.current);
    governedWatch.current = null;
    setLoading(true);
    setError("");
    setResult(null);
    setInternalKnowledge("");
    setGovernedStatus("");
    setScreen(null);
    setChoice(0);
    try {
      // The real governed submission MUST NOT depend on knowledge retrieval.
      // Previously a failed lookup stopped ENGAGE before the runtime saw the objective.
      const submitted = await submitGuestObjective({ data: { objective: text } });
      if (generation.current !== token) return;
      const requestId = submitted.request.id;
      const guestToken = submitted.guestToken;
      setGovernedStatus("ASCENSION governed queue: " + submitted.request.status);

      // Show existing Knowledgeverse evidence when available; its failure never
      // blocks execution, and this phase never invokes a paid model.
      void (async () => {
        try {
          const response = await fetch("/api/public/ascension/independent", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ objective: text, category: categoryRef.current, phase: "knowledge" }),
            signal: controller.signal,
          });
          if (!response.ok) return;
          const first: { contributor?: string; answer?: string } = await response.json();
          if (generation.current === token && first.contributor === "ASCENSION_KNOWLEDGE_RETRIEVAL" && first.answer)
            setInternalKnowledge(first.answer);
        } catch { /* Knowledge retrieval is informational, never an execution gate. */ }
      })();

      let terminal = false;
      let polling = false;
      let failures = 0;
      const poll = async () => {
        if (generation.current !== token || terminal || polling) return;
        polling = true;
        try {
          const state = await getGuestObjectiveStatus({ data: { requestId, guestToken } });
          if (generation.current !== token) return;
          const run = state.request;
          if (!run) {
            setError("ENGAGE: the governed queue did not return this objective's status.");
            return;
          }
          failures = 0;
          if (run.status === "verified") {
            // Status VERIFIED is not a delivered pathway. Keep polling the actual
            // authorized delivery until it is ready; PR 63 checked only once.
            const delivered = await getGuestObjectiveDelivery({ data: { requestId, guestToken } });
            if (generation.current !== token) return;
            const payload = delivered?.status === "completed" ? delivered.response_payload : null;
            const actual = payload && delivered?.source === "governed" ? fromGovernedDelivery(payload) : null;
            if (actual) {
              setResult(actual);
              setScreen("spiral");
              setGovernedStatus("ASCENSION delivered three pathways and BLEND.");
              offer(guideFor(actual));
              terminal = true;
              return;
            }
            if (delivered?.status === "completed") {
              const reason = delivered.source === "external_draft"
                ? "Only an external draft was returned, not the required governed pathways."
                : delivered.error || "The governed result contains no complete set of three pathways and BLEND.";
              setError("ENGAGE delivery incomplete: " + reason.slice(0, 350));
              terminal = true;
              return;
            }
            setGovernedStatus("ASCENSION verified the objective. Waiting for its pathway delivery." +
              (delivered?.note ? " " + delivered.note.slice(0, 180) : ""));
            return;
          }
          if (run.status === "failed" || run.status === "rejected") {
            setError("ASCENSION governed execution " + run.status + ": " +
              (run.error || "The runtime did not provide an error message.").slice(0, 350));
            terminal = true;
            return;
          }
          setGovernedStatus("ASCENSION governed runtime: " + run.status +
            (run.stage ? " · " + run.stage : ""));
        } catch (cause) {
          failures += 1;
          const message = cause instanceof Error ? cause.message : String(cause);
          setError("ASCENSION runtime connection: " + message.slice(0, 350));
          if (failures >= 3) terminal = true;
        } finally {
          polling = false;
          if (terminal && governedWatch.current) clearInterval(governedWatch.current);
          if (terminal) governedWatch.current = null;
        }
      };
      await poll();
      if (generation.current === token && !terminal && governedWatch.current === null)
        governedWatch.current = setInterval(() => { void poll(); }, 3500);
    } catch (cause) {
      if (generation.current === token) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError("ENGAGE submission failed: " + message.slice(0, 350));
      }
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }

  engageRef.current = () => { void engage(); };

  function stop() {
    generation.current += 1;
    abort.current?.abort();
    if (governedWatch.current) clearInterval(governedWatch.current);
    governedWatch.current = null;
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
                  onClick={() => chooseCategory(option)}>{option}</button>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute bottom-[22%] left-1/2 z-20 flex w-[min(90%,38rem)] -translate-x-1/2 flex-col items-center gap-3 text-center">
            <span className="text-sm text-amber-200">{category}</span>
            <button type="button" onClick={() => listenForObjective()} disabled={loading}
              className="min-h-12 rounded-full border border-amber-400/70 bg-black/85 px-5 text-amber-100">
              {listening ? "STOP LISTENING" : "SPEAK OBJECTIVE"}
            </button>
            <p role="status" aria-live="polite" className="max-h-24 overflow-auto rounded-lg bg-black/85 px-3 py-2 text-sm text-white">
              {objective || (listening ? "Listening…" : "Your spoken objective will appear here.")}
            </p>
            {voiceError && <p role="alert" className="text-sm text-red-200">{voiceError}</p>}
            {textBackup && <label className="w-full text-sm text-amber-100">Text backup
              <textarea rows={2} value={objective} maxLength={2400}
                className="mt-1 block w-full rounded border border-amber-300/50 bg-black/90 p-2 text-white"
                placeholder="Enter your objective" onChange={event => {
                  setObjective(event.target.value);
                  objectiveRef.current = event.target.value;
                }} />
            </label>}
          </div>
        )}
        {microphonePrompt && microphone === "checking" && <p className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded bg-black/85 p-3 text-sm text-white" role="status">Allow microphone access to control ASCENSION by voice.</p>}
        {microphone === "unavailable" && <button type="button" onClick={() => void requestMicrophone()}
          className="absolute right-4 top-4 z-30 rounded border border-amber-400 bg-black/90 p-3 text-amber-100">Enable microphone</button>}
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
        {governedStatus && <p className="ascension-tree-status" role="status">{governedStatus}</p>}
        {internalKnowledge && <section className="ascension-tree-status" aria-label="ASCENSION existing knowledge">
          <p className="whitespace-pre-wrap">{internalKnowledge}</p>
          <p>New pathways are not verified or available until the governed ASCENSION runtime processes the objective.</p>
        </section>}
        {category && <button type="button" onClick={toggleTalking} aria-pressed={!talking} className="ascension-tree-hear">
          {talking ? "MUTE TREE" : "HEAR TREE"}
        </button>}
      </div>
    </section>
    {screen && result && <DesignedFlow screen={screen} readings={readings} talking={talking} onToggleTalking={toggleTalking} onScreen={show} onOpen={openPathway} />}
  </div>;
}
