import { useEffect, useRef, useState } from "react";
import { CrystalSurface, type CrystalDesign } from "./crystal-surface";
import type { DesignView } from "./v1-design-viewport";
import { submitGuestObjective, getGuestObjectiveStatus, getGuestObjectiveDelivery } from "@/lib/ascension/guest.functions";
import { listIntentCrystals, recordIntentCrystal, inspectIntentCrystal, type CrystalSummary } from "@/lib/ascension/intent-crystals.functions";
import type { ObjectiveDelivery } from "@/lib/ascension/result-model";
import {
  parseSeenGrowth, newlyVerifiedCount, pendingGrowthSummary,
  markGrowthSeen, describeNewGrowth, welcomeBackGrowth,
  type CrystalGrowth,
} from "@/lib/ascension/crystal-return";
import "./crystal-experience.css";

const BOOK = "/approved-scene/01-closed-book.jpg";
// Original owner-approved single composition, Tree + Groundskeeper + Book together.
// Do not split, crop, recolor, regenerate, or replace either figure.
const APPROVED_SCENE = "/approved-scene/ascension-exact-approved-scene.png";
const LIBRARY_KEY = "ascension-library-card-capability-v1";
const VERIFIED_SEEN_KEY = "ascension-library-card-last-viewed-verified-v1";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type RunKey = { requestId: string; guestToken: string };
type IntentRecord = { id: string; intent: string; run: RunKey };
type StoredAnswer = { body: string; title: string; limitations: string[]; design: CrystalDesign | null; parts: string[] };
function deliveredAnswer(payload: ObjectiveDelivery): StoredAnswer | null {
  if (payload.kind === "not_produced" || !payload.body.trim()) return null;
  const actual = payload.blend;
  const model = actual?.model_spec;
  const parts = model?.parts.map(part => part.name) ?? [];
  return {
    body: payload.body.trim(), title: payload.title,
    limitations: payload.limitations,
    // Only real delivered media is projected. No stock model or invented measurements.
    design: actual?.model_url || actual?.generated_image_url || actual?.generated_blueprint_url
      ? {
          title: payload.title, summary: payload.body,
          modelUrl: actual.model_url ?? null,
          imageUrl: actual.generated_image_url ?? null,
          blueprintUrl: actual.generated_blueprint_url ?? null,
        }
      : null,
    parts,
  };
}
function guideSuggestion(answer: StoredAnswer): string {
  if (answer.parts.length >= 2) return "Would you like to examine how " +
    answer.parts[0] + " and " + answer.parts[1] + " work together?";
  if (answer.limitations.length) return "There is a limitation worth exploring. Would you like me to explain it?";
  return "Would you like me to explain this further or develop your intent?";
}
function seenVerifiedGrowth() {
  try { return parseSeenGrowth(window.localStorage.getItem(VERIFIED_SEEN_KEY)); }
  catch { return {}; }
}
function acknowledgeVerifiedGrowth(crystal: CrystalGrowth) {
  try {
    window.localStorage.setItem(VERIFIED_SEEN_KEY, JSON.stringify(
      markGrowthSeen(crystal, seenVerifiedGrowth()),
    ));
  } catch { /* Voice recall still works without locally stored visit markers. */ }
}
function libraryCapability(): string {
  const existing = window.localStorage.getItem(LIBRARY_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  const key = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  window.localStorage.setItem(LIBRARY_KEY, key);
  return key;
}
/**
 * Approved single-page flow:
 * Book = Library Card; Tree = knowledge container; persistent cosmic groundskeeper;
 * each crystal = one intent, which is reread from the governed runtime on return.
 * No four model pathways, text welcome banner, or invented background discoveries.
 */
export function CrystalExperience() {
  const [entered, setEntered] = useState(false);
  const [crystals, setCrystals] = useState<CrystalSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<StoredAnswer | null>(null);
  const [view, setView] = useState<DesignView>("assembled");
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [working, setWorking] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [backup, setBackup] = useState(false);
  const [draft, setDraft] = useState("");
  const [issue, setIssue] = useState("");
  const [sceneAvailable, setSceneAvailable] = useState(true);
  const [revision, setRevision] = useState<number | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const enteredRef = useRef(false);
  const workingRef = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestEpoch = useRef(0);
  const chosen = useRef<IntentRecord | null>(null);
  const continuing = useRef(false);
  const crystalsRef = useRef<CrystalSummary[]>([]);
  const answerRef = useRef<StoredAnswer | null>(null);
  const mutedRef = useRef(false);
  const speechSerial = useRef(0);
  const processVoice = useRef<(words: string) => void>(() => {});
  const hasArtwork = sceneAvailable;

  useEffect(() => { crystalsRef.current = crystals; }, [crystals]);
  useEffect(() => { answerRef.current = answer; }, [answer]);
  useEffect(() => { workingRef.current = working; }, [working]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  function speak(words: string, thenListen = true) {
    const serial = ++speechSerial.current;
    if (mutedRef.current || !("speechSynthesis" in window)) return;
    recognition.current?.stop();
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(words.slice(0, 1600));
    utterance.rate = 0.96;
    utterance.pitch = 1.01;
    const voices = synthesis.getVoices().filter(voice => voice.lang.toLowerCase().startsWith("en"));
    utterance.voice = voices.find(voice => /samantha|jenny|aria|zira|serena|ava|female/i.test(voice.name)) ?? null;
    utterance.onstart = () => { if (speechSerial.current === serial) setSpeaking(true); };
    utterance.onend = () => {
      if (speechSerial.current !== serial) return;
      setSpeaking(false);
      if (thenListen && enteredRef.current && !workingRef.current) listen(true);
    };
    utterance.onerror = () => { if (speechSerial.current === serial) setSpeaking(false); };
    synthesis.speak(utterance);
  }
  function listen(automatic = false) {
    if (workingRef.current) return;
    const browser = window as Window & {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Ctor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Ctor) {
      setBackup(true);
      if (!automatic) setIssue("Speech recognition is unavailable here. You can type your intent.");
      return;
    }
    speechSerial.current++; // Cancelled utterances must never restart the microphone.
    recognition.current?.stop();
    window.speechSynthesis?.cancel();
    const mic = new Ctor();
    recognition.current = mic;
    mic.lang = "en-US";
    mic.continuous = false;
    mic.interimResults = false;
    mic.onresult = event => {
      const spoken = Array.from(event.results).at(-1)?.[0]?.transcript?.trim();
      if (spoken) processVoice.current(spoken);
    };
    mic.onerror = event => {
      if (recognition.current !== mic) return;
      setListening(false);
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setIssue("Microphone: " + event.error);
        setBackup(true);
      }
    };
    mic.onend = () => { if (recognition.current === mic) { recognition.current = null; setListening(false); } };
    try { mic.start(); setListening(true); } catch {
      setListening(false); setBackup(true);
      if (!automatic) setIssue("Microphone could not start. You can type instead.");
    }
  }
  async function refreshCrystals(): Promise<CrystalSummary[]> {
    const list = await listIntentCrystals({ data: { libraryKey: libraryCapability() } });
    setCrystals(list);
    return list;
  }
  function clearPoll() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }
  async function recallCrystal(id: string) {
    if (workingRef.current) return;
    clearPoll();
    const epoch = ++requestEpoch.current;
    setIssue("");
    try {
      const state = await inspectIntentCrystal({ data: {
        libraryKey: libraryCapability(), crystalId: id,
      } });
      if (epoch !== requestEpoch.current) return;
      if (!state.continuation) throw new Error("This crystal has no recoverable governed run authorization.");
      chosen.current = { id, intent: state.crystal.intent, run: state.continuation };
      setSelectedId(id);
      setRevision(state.crystal.verifiedRevision);
      setView("assembled");
      const next = state.delivery ? deliveredAnswer(state.delivery) : null;
      const newRevisions = newlyVerifiedCount(state.crystal, seenVerifiedGrowth());
      setAnswer(next);
      await refreshCrystals();
      if (next) {
        acknowledgeVerifiedGrowth(state.crystal);
        speak("I have retrieved your intent. " +
          describeNewGrowth(newRevisions) +
          (state.status === "verified" ? "" : "Its next development is still running. Here is the latest verified answer. ") +
          next.body + " " + guideSuggestion(next));
      }
      else speak("This crystal holds your intent. The governed runtime reports " + state.status +
        ". I will only present developments the runtime actually records.");
    } catch (cause) { if (epoch === requestEpoch.current) setIssue("Crystal recall: " + String(cause)); }
  }
  async function sendIntent(intent: string) {
    const statement = intent.trim();
    if (!statement || workingRef.current) return;
    const parent = continuing.current ? chosen.current : null;
    continuing.current = false;
    const epoch = ++requestEpoch.current;
    clearPoll();
    workingRef.current = true;
    setWorking(true);
    setIssue("");
    // A continuation must not hide the last verified creation while the next
    // governed run is pending. New intentions start with an empty crystal.
    if (!parent) setAnswer(null);
    setView("assembled");
    setDraft("");
    recognition.current?.stop();
    try {
      const submission = await submitGuestObjective({ data: {
        objective: statement,
        ...(parent ? {
          parentRequestId: parent.run.requestId,
          parentGuestToken: parent.run.guestToken,
          followUp: "continue" as const,
          evidence: [JSON.stringify({ source: "ASCENSION_INTENT_CRYSTAL",
            parent_intent: parent.intent, user_requested_continuation: statement }).slice(0, 2000)],
        } : {}),
      } });
      if (epoch !== requestEpoch.current) return;
      const run = { requestId: submission.request.id, guestToken: submission.guestToken };
      // The original run keeps executing if a browser tab is closed.
      try {
        const stored = await recordIntentCrystal({ data: {
          libraryKey: libraryCapability(), intent: parent?.intent ?? statement,
          ...run, ...(parent ? { crystalId: parent.id, parentRequestId: parent.run.requestId } : {}),
        } });
        if (epoch !== requestEpoch.current) return;
        chosen.current = { id: stored.id, intent: stored.intent, run };
        setSelectedId(stored.id);
        await refreshCrystals();
      } catch (cause) {
        // Do not claim that a transient intention was stored or would grow.
        setIssue("Intent submitted, but persistent crystal storage failed: " + String(cause));
      }
      const poll = async () => {
        if (epoch !== requestEpoch.current) return;
        try {
          const state = await getGuestObjectiveStatus({ data: run });
          if (epoch !== requestEpoch.current) return;
          const status = state.request?.status;
          if (status === "verified") {
            const delivered = await getGuestObjectiveDelivery({ data: run });
            if (epoch !== requestEpoch.current) return;
            if (delivered?.status !== "completed") return;
            clearPoll();
            const actual = delivered.source === "governed" && delivered.response_payload
              ? deliveredAnswer(delivered.response_payload) : null;
            if (!actual) throw new Error("The original governed runtime supplied no completed answer.");
            setAnswer(actual);
            if (chosen.current) {
              try {
                const crystal = await inspectIntentCrystal({ data: {
                  libraryKey: libraryCapability(), crystalId: chosen.current.id,
                } });
                setRevision(crystal.crystal.verifiedRevision);
                if (crystal.delivery) acknowledgeVerifiedGrowth(crystal.crystal);
                await refreshCrystals();
              } catch { /* The real answer still belongs to the governed run. */ }
            }
            workingRef.current = false;
            setWorking(false);
            speak("Your intent has produced a governed answer. " + actual.body +
              " " + guideSuggestion(actual));
          } else if (status === "failed" || status === "rejected") {
            clearPoll(); workingRef.current = false; setWorking(false);
            setIssue("The governed runtime reports " + status + ": " +
              (state.request?.error || "No further details."));
          }
        } catch (cause) {
          if (epoch !== requestEpoch.current) return;
          clearPoll(); workingRef.current = false; setWorking(false);
          setIssue("Governed intent processing: " + String(cause));
        }
      };
      await poll();
      if (epoch === requestEpoch.current && workingRef.current) timer.current = setInterval(() => { void poll(); }, 3500);
    } catch (cause) {
      if (epoch !== requestEpoch.current) return;
      clearPoll(); workingRef.current = false; setWorking(false);
      setIssue("Could not submit intent: " + String(cause));
    }
  }
  processVoice.current = words => {
    const input = words.trim();
    const lower = input.toLowerCase().replace(/[.,!?]/g, "").trim();
    if (!enteredRef.current) { void enter(); return; }
    if (workingRef.current) return;
    if (/^(?:continue this intent|keep developing this intent|build on this intent)$/.test(lower)) {
      if (!chosen.current) speak("First retrieve the intent crystal you want to continue.");
      else {
        continuing.current = true;
        void sendIntent(input);
      }
      return;
    }
    if (/^(?:new intent|start a new intent)$/.test(lower)) {
      chosen.current = null; continuing.current = false;
      setAnswer(null); setSelectedId(null);
      speak("I'm here. What would you like to create or explore?");
      return;
    }
    const recall = lower.match(/^(?:recall|bring back|retrieve|open my|show my|recall my)\s+(.+)$/);
    if (recall) {
      const phrase = recall[1]!.replace(/\b(?:intent|crystal|design)\b/g, "").trim();
      const match = phrase && crystalsRef.current.find(item => item.intent.toLowerCase().includes(phrase));
      if (match) { void recallCrystal(match.id); return; }
      speak("I haven't found that intent on this Library Card. Please say the intent's name.");
      return;
    }
    if (/^(?:what has grown|what changed|what is new with this intent)$/.test(lower)) {
      if (chosen.current) void recallCrystal(chosen.current.id);
      else speak("Tell me which intent crystal you would like me to retrieve.");
      return;
    }
    if (answerRef.current) {
      if (/^(?:rotate|turn) (?:left|right)$/.test(lower)) {
        if (!answerRef.current.design?.modelUrl) speak("I need the delivered three-dimensional model to rotate it accurately.");
        else setRotation(value => value + (lower.endsWith("right") ? 1 : -1));
        return;
      }
      if (lower === "zoom in" || lower === "zoom out") {
        setZoom(value => value + (lower.endsWith("in") ? 1 : -1)); return;
      }
      const views: Record<string, DesignView> = {
        "show me inside": "dissect", "show inside": "dissect",
        "take it apart": "exploded", "explode": "exploded",
        "put it together": "imploded", "implode": "imploded",
        "show the blueprint": "blueprint", "give me the dimensions": "blueprint",
        "show assembled": "assembled",
      };
      if (views[lower]) {
        if (!answerRef.current.design) speak("There is no delivered measured model or drawing for that view yet.");
        else setView(views[lower]);
        return;
      }
      if (/^(?:explain|tell me about it|how does it work)$/.test(lower)) {
        speak(answerRef.current.body); return;
      }
      if (/^(?:what do you suggest|any suggestions|suggest an improvement)$/.test(lower)) {
        speak(guideSuggestion(answerRef.current)); return;
      }
      if (/^(?:build on|improve|change|modify|add|remove|replace|extend|reduce)\b/.test(lower)) {
        continuing.current = true; void sendIntent(input); return;
      }
    }
    chosen.current = null;
    continuing.current = false;
    void sendIntent(input);
  };
  async function enter() {
    try {
      libraryCapability();
      enteredRef.current = true;
      setEntered(true);
      const saved = await refreshCrystals();
      const unseen = pendingGrowthSummary(saved, seenVerifiedGrowth());
      speak(welcomeBackGrowth(unseen.crystalCount, unseen.revisionCount));
    } catch (cause) {
      setIssue("Library Card is not available: " + String(cause));
    }
  }
  // The Tree keeps showing newly verified crystal growth while this page is open.
  // Work itself belongs to the persistent server, not the user's browser.
  useEffect(() => {
    if (!entered) return;
    const refresh = window.setInterval(() => {
      void refreshCrystals().catch(() => { /* A temporary refresh failure is not growth. */ });
    }, 60000);
    return () => window.clearInterval(refresh);
  }, [entered]);

  useEffect(() => () => {
    requestEpoch.current++;
    clearPoll();
    speechSerial.current++;
    recognition.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  return <main className="ascension-living-world" aria-label="ASCENSION Knowledgeverse">
    {!entered ? <section className="ascension-library-book" aria-label="Library Card">
      <img src={BOOK} alt="ASCENSION Library Card" draggable={false}/>
      <button type="button" onClick={() => void enter()} aria-label="Enter ASCENSION using the Library Card">
        Enter ASCENSION
      </button>
    </section> : <>
      <div className="ascension-approved-scene" data-speaking={speaking}
        aria-label="The owner-approved Groundskeeper, Tree of Knowledge, Book, and crystal scene">
        {sceneAvailable && <img src={APPROVED_SCENE} alt=""
          draggable={false} onError={() => setSceneAvailable(false)}/>}
      </div>
      {!hasArtwork && <p className="ascension-artwork-pending" role="status">
        The exact owner-approved ASCENSION scene file is missing. No replacement image will be shown.
      </p>}
      <CrystalSurface working={working} design={answer?.design ?? null}
        view={view} rotateRequest={rotation} zoomRequest={zoom}
        crystals={crystals} selectedId={selectedId} onRecall={id => void recallCrystal(id)}/>
      <div className="ascension-voice-anchor">
        <button type="button" aria-label={listening ? "Stop microphone" : "Speak with groundskeeper"}
          aria-pressed={listening} onClick={() => {
            if (listening) recognition.current?.stop(); else listen();
          }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="13" rx="3"/>
            <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>
          </svg>
        </button>
        {backup && <form onSubmit={event => { event.preventDefault(); processVoice.current(draft); }}>
          <label htmlFor="ascension-intent-backup">Intent</label>
          <textarea id="ascension-intent-backup" value={draft} onChange={event => setDraft(event.target.value)}
            placeholder="Speak or type your intent" maxLength={4000}/>
          <button type="submit" disabled={!draft.trim() || working}>Send</button>
        </form>}
      </div>
      <button type="button" className="ascension-voice-toggle"
        aria-label={muted ? "Unmute groundskeeper" : "Mute groundskeeper"}
        onClick={() => {
          setMuted(value => !value);
          if (!muted) { speechSerial.current++; window.speechSynthesis?.cancel(); setSpeaking(false); }
        }}>{muted ? "◖×" : "◖))"}</button>
      {working && <span className="sr-only" role="status">The governed engine is working on your intent.</span>}
      {revision && <span className="sr-only">Verified runtime revision {revision} is attached to the active intent.</span>}
      {answer && <span className="sr-only" role="status">{answer.body}</span>}
    </>}
    {issue && <p role="alert" className="ascension-crystal-error">{issue}</p>}
  </main>;
}
