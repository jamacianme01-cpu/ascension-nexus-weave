import { useEffect, useRef, useState } from "react";
import { type DesignedScreen, type DesignedTarget, type PathwayReading } from "@/components/ascension/designed-flow";
import { LivingTree } from "@/components/ascension/living-tree";
import { TreeStudio } from "@/components/ascension/tree-studio";
import "./living-tree-scene.css";
import { submitGuestObjective, getGuestObjectiveStatus, getGuestObjectiveDelivery } from "@/lib/ascension/guest.functions";
import { governedPersisted, type ObjectiveDelivery } from "@/lib/ascension/result-model";

type Part = { name: string; purpose: string; location: string };
type Pathway = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[]; imageUrl: string | null; blueprintUrl: string | null; modelUrl: string | null; blend_reason?: string };
type Result = {
  introduction: string;
  pathways: Pathway[];
  blend: Pathway & { blend_reason: string };
  files?: { name: string; content: string }[];
};
type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};

const BOOK = "/approved-scene/01-closed-book.jpg";
const WELCOMES = [
  "Hello, it's good to see you. What would you like to work on today?",
  "Welcome back. What are we creating or exploring today?",
  "Hello there. The book is open, and I'm here to help you think things through.",
  "Good to have you here. Tell me what's on your mind.",
];

let speechSequence = 0;
let activeUtterance: SpeechSynthesisUtterance | null = null;
function signalSpeaking(active: boolean) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ascension-tree-speech", { detail: { speaking: active } }));
}
function say(text: string, onFinished?: () => void) {
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
      if (sequence === speechSequence) {
        activeUtterance = null;
        signalSpeaking(false);
        onFinished?.();
      }
      return;
    }
    const words = new SpeechSynthesisUtterance(chunks[index++]!);
    activeUtterance = words;
    words.rate = 0.96;
    words.pitch = 1.04;
    // Select a natural-sounding woman voice when the browser provides one.
    // Never promise a voice that the user's device has not installed.
    const available = (synth.getVoices?.() ?? []).filter(v => v.lang.toLowerCase().startsWith("en"));
    words.voice = available.find(v => /samantha|jenny|aria|zira|serena|victoria|susan|kate|ava|female/i.test(v.name)) ?? null;
    words.onstart = () => signalSpeaking(true);
    words.onboundary = () => window.dispatchEvent(new Event("ascension-tree-syllable"));
    words.onend = next;
    words.onerror = next;
    try { synth.speak(words); } catch { activeUtterance = null; }
  };
  next();
}
function stopVoice() {
  speechSequence += 1;
  activeUtterance = null;
  signalSpeaking(false);
  try { window.speechSynthesis?.cancel(); } catch { /* Browser may lack speech playback. */ }
}

function nextWelcome(): string {
  try {
    const key = "ascension-tree-welcome-rotation-v1";
    const n = Number(window.localStorage.getItem(key) || "-1");
    const next = Number.isInteger(n) && n >= -1 ? (n + 1) % WELCOMES.length : 0;
    window.localStorage.setItem(key, String(next));
    return WELCOMES[next]!;
  } catch { return WELCOMES[0]!; }
}

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
  return `The governed result is ready. I can show the design, explain its components, or help you change it.`;
}

function fromGovernedDelivery(delivery: ObjectiveDelivery): Result | null {
  if (delivery.kind === "not_produced" || !delivery.body.trim()) return null;
  // A truthful single core result is a valid creation/conversation.
  // Do not reject it for missing legacy model pathways or invent geometry.
  if (!delivery.blend || delivery.pathways.length !== 3) {
    const output: Pathway & { blend_reason: string } = {
      id: "governed-single-output",
      title: delivery.title,
      summary: delivery.body,
      steps: [], tradeoffs: delivery.limitations, parts: [],
      imageUrl: null, blueprintUrl: null, modelUrl: null,
      blend_reason: "",
    };
    return { introduction: delivery.body, pathways: [], blend: output, files: delivery.files };
  }
  const toPath = (path: ObjectiveDelivery["pathways"][number]): Pathway => ({
    id: path.id, title: path.label, summary: path.summary,
    steps: path.steps, tradeoffs: path.tradeoffs,
    // Retain real delivered assets, not the same stock drone picture for all objectives.
    parts: path.model_spec?.parts.map(part => ({
      name: part.name,
      purpose: part.purpose ?? "",
      location: part.location ?? "",
    })) ?? [],
    imageUrl: path.generated_image_url ?? null,
    blueprintUrl: path.generated_blueprint_url ?? null,
    modelUrl: path.model_url ?? null,
  });
  const pathways = delivery.pathways.map(toPath);
  const blend = { ...toPath(delivery.blend), blend_reason: delivery.blend.blend_reason };
  if (new Set(pathways.map(path => path.id)).size !== 3 ||
      pathways.some(path => !path.title.trim() || !path.summary.trim()) ||
      !blend.title.trim() || !blend.summary.trim()) return null;
  return { introduction: delivery.body, pathways, blend, files: delivery.files };
}

function openLine(path: Pathway, blend: boolean): string {
  const detail = sentence(blend ? path.blend_reason || path.summary : path.summary);
  if (blend) return `${path.title}. ${detail}`;
  return `${path.title}. ${detail} The other views are there if a closer look would help.`;
}

/** Hosted Tree entry. Engines analyze the answer; the fourth pathway is the blend. */
export function IndependentEngage() {
  const [objective, setObjective] = useState("");
  const [category, setCategory] = useState<"Business Planner" | "Build / Create" | "Guidance" | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [verifiedRevision, setVerifiedRevision] = useState<number | null>(null);
  const [rotationRequest, setRotationRequest] = useState(0);
  const [zoomRequest, setZoomRequest] = useState(0);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [microphone, setMicrophone] = useState<"checking" | "ready" | "unavailable">("checking");
  const [textBackup, setTextBackup] = useState(false);
  const [microphonePrompt, setMicrophonePrompt] = useState(false);
  const objectiveRef = useRef("");
  const categoryRef = useRef<typeof category>(null);
  const engageRef = useRef<() => void>(() => {});
  const guideCommandRef = useRef<(spoken: string) => boolean>(() => false);
  const listeningRef = useRef(false);
  const loadingRef = useRef(false);
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
  const restored = useRef(false);
  const MEMORY_KEY = "ascension-v1-current-session";
  // Continuation retains the existing governed run and its guest authorization.
  const activeRun = useRef<{ requestId: string; guestToken: string } | null>(null);
  const continuation = useRef<{ requestId: string; guestToken: string; selected: Pathway; blend: boolean } | null>(null);

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);
  // Restore the same authorized guest run and actual delivered pathways after
  // a reload of this tab. Session storage expires with the browser tab.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = window.sessionStorage.getItem(MEMORY_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        savedAt: number; category: typeof category; objective: string;
        result: Result; run: { requestId: string; guestToken: string };
        screen: DesignedScreen | null; choice: number; verifiedRevision?: number | null;
      };
      if (!saved || !Number.isFinite(saved.savedAt) ||
          Date.now() - saved.savedAt > 24 * 60 * 60 * 1000 ||
          !["Business Planner", "Build / Create", "Guidance"].includes(saved.category || "") ||
          !saved.result || !Array.isArray(saved.result.pathways) || !saved.result.blend ||
          !/^[a-f0-9-]{36}$/i.test(saved.run?.requestId || "") ||
          !/^[a-f0-9-]{36}$/i.test(saved.run?.guestToken || "")) {
        window.sessionStorage.removeItem(MEMORY_KEY);
        return;
      }
      activeRun.current = saved.run;
      setBookOpen(true);
      if (typeof saved.verifiedRevision === "number" && Number.isInteger(saved.verifiedRevision) && saved.verifiedRevision > 0) {
        setVerifiedRevision(saved.verifiedRevision);
      }
      // Restoring an existing pathway is not a fresh entry welcome.
      welcomed.current = true;
      categoryRef.current = saved.category;
      setCategory(saved.category);
      objectiveRef.current = saved.objective;
      setObjective(saved.objective);
      setResult(saved.result);
      setChoice(Number.isInteger(saved.choice) && saved.choice >= 0 && saved.choice < 4 ? saved.choice : 0);
      setScreen(saved.screen && ["spiral", "assembled", "blueprint", "dissect", "exploded", "imploded"].includes(saved.screen)
        ? saved.screen : saved.result.pathways.length === 3 ? "spiral" : "assembled");
    } catch {
      window.sessionStorage.removeItem(MEMORY_KEY);
    }
  }, []);
  useEffect(() => {
    if (!restored.current || !category || !result || !activeRun.current) return;
    try {
      window.sessionStorage.setItem(MEMORY_KEY, JSON.stringify({
        savedAt: Date.now(), category, objective, result, run: activeRun.current,
        screen, choice, verifiedRevision,
      }));
    } catch { /* Browser storage may be restricted. */ }
  }, [category, objective, result, screen, choice, verifiedRevision]);
  useEffect(() => { objectiveRef.current = objective; }, [objective]);
  useEffect(() => {
    if (!category || welcomed.current) return;
    welcomed.current = true;
    if (talking) {
      recognition.current?.stop();
      say(nextWelcome(), () => {
        if (categoryRef.current) listenForObjective(true);
      });
    }
  }, [category, talking]);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); recognition.current?.stop(); if (governedWatch.current) clearInterval(governedWatch.current); stopVoice(); }, []);

  useEffect(() => {
    // Do not request microphone permission on the closed Book.
    if (!bookOpen) return;
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
      // Do not interrupt the Tree's welcome by starting recognition here.
      // The welcome completion starts listening when ASCENSION opens.
    }).catch(() => {
      if (closed) return;
      setMicrophone("unavailable");
      setTextBackup(true);
      setMicrophonePrompt(false);
    });
    return () => { closed = true; };
  }, [bookOpen]);

  function chooseCategory(next: "Business Planner" | "Build / Create" | "Guidance") {
    categoryRef.current = next;
    continuation.current = null;
    activeRun.current = null;
    generation.current += 1;
    abort.current?.abort();
    if (governedWatch.current) clearInterval(governedWatch.current);
    governedWatch.current = null;
    loadingRef.current = false;
    setLoading(false);
    try { window.sessionStorage.removeItem(MEMORY_KEY); } catch { /* Restricted storage. */ }
    setResult(null);
    setVerifiedRevision(null);
    setScreen(null);
    setChoice(0);
    setCategory(next);
    setBookOpen(true);
    setObjective("");
    objectiveRef.current = "";
    setError("");
  }

  function handleVoice(text: string) {
    const spoken = text.trim();
    const normalized = spoken.toLowerCase().replace(/[.,!?]/g, "").trim();
    if (!spoken) return;
    // Keep spoken pathway and viewing commands available after ENGAGE.
    if (guideCommandRef.current(normalized)) return;
    // A Book category is a navigation choice, not a domain filter for objectives.
    const categoryCommand = normalized.replace(/^(?:choose|select|change category to|switch to)\s+/, "");
    const explicitlySelectingCategory = categoryCommand !== normalized;
    if (!categoryRef.current || explicitlySelectingCategory) {
      if (categoryCommand === "business planner" || categoryCommand === "business") {
        chooseCategory("Business Planner"); return;
      }
      if (categoryCommand === "build create" || categoryCommand === "build" || categoryCommand === "build and create") {
        chooseCategory("Build / Create"); return;
      }
      if (categoryCommand === "guidance") { chooseCategory("Guidance"); return; }
    }
    if (normalized === "engage" || normalized === "engage ascension") {
      engageRef.current();
      return;
    }
    if (normalized === "stop" || normalized === "stop listening") {
      recognition.current?.stop();
      return;
    }
    // The Book opens the Tree. No objective executes before that choice.
    if (!categoryRef.current) return;
    // Recognition callbacks can hold a stale React render. Use the live lock.
    if (loadingRef.current) return;
    // No keyword or objective-domain gate: every valid objective is submitted
    // to the same governed ASCENSION execution pipeline without reinterpretation.
    objectiveRef.current = spoken.slice(0, 4000);
    setObjective(objectiveRef.current);
    recognition.current?.stop();
    // Subsequent conversation continues the SAME actual governed objective.
    if (result && activeRun.current && !continuation.current) {
      const selected = result.pathways[choice] ?? result.blend;
      continuation.current = { ...activeRun.current, selected, blend: selected.id === result.blend.id };
    }
    // A spoken objective executes hands-free; the existing button remains
    // available when speech recognition or a microphone is unavailable.
    engageRef.current();
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
      // A stopped older listener must never overwrite the current listener.
      if (recognition.current !== listener) return;
      setVoiceError("Speech recognition: " + event.error);
      listeningRef.current = false;
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setTextBackup(true);
    };
    listener.onend = () => {
      if (recognition.current !== listener) return;
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
    if (!talking) return;
    recognition.current?.stop();
    say(text, () => {
      if (categoryRef.current) listenForObjective(true);
    });
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
    if (!text || loadingRef.current) return;
    loadingRef.current = true;
    const token = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    if (governedWatch.current) clearInterval(governedWatch.current);
    governedWatch.current = null;
    setLoading(true);
    recognition.current?.stop();
    setError("");
    // Keep the selected design available during BUILD ON RESULT.
    // Only replace it when the continued governed delivery succeeds.
    if (!continuation.current) setResult(null);
    setInternalKnowledge("");
    setGovernedStatus("");
    if (!continuation.current) {
      setScreen(null);
      setChoice(0);
    }
    try {
      // The real governed submission MUST NOT depend on knowledge retrieval.
      // Previously a failed lookup stopped ENGAGE before the runtime saw the objective.
      // A selected design continues its actual recorded run, not an unrelated new objective.
      const selected = result ? result.pathways[choice] ?? result.blend : null;
      const parent = continuation.current ??
        (selected && result && activeRun.current
          ? { ...activeRun.current, selected, blend: selected.id === result.blend.id }
          : null);
      const submitted = await submitGuestObjective({ data: {
        objective: text,
        ...(parent ? {
          parentRequestId: parent.requestId,
          parentGuestToken: parent.guestToken,
          followUp: "continue" as const,
          evidence: [JSON.stringify({
            source: "ASCENSION_SELECTED_RESULT",
            pathway_id: parent.selected.id,
            label: parent.selected.title,
            summary: parent.selected.summary,
            blend: parent.blend,
            steps: parent.selected.steps,
            parts: parent.selected.parts,
          }).slice(0, 2000)],
        } : {}),
      } });
      if (generation.current !== token) return;
      continuation.current = null;
      const requestId = submitted.request.id;
      const guestToken = submitted.guestToken;
      // Do not bind a previously selected design to a new run before that
      // run has delivered a verified replacement.
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
            terminal = true;
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
              activeRun.current = { requestId, guestToken };
              setResult(actual);
              if (parent) {
                // BUILD ON RESULT remains in the design inspection experience.
                // Match the continuing pathway by its recorded ID when possible;
                // otherwise retain the original pathway position, including BLEND.
                const updated = [...actual.pathways, actual.blend];
                const originalIndex = parent.blend ? 3 : result?.pathways.findIndex(p => p.id === parent.selected.id) ?? 0;
                const matchedIndex = updated.findIndex(p => p.id === parent.selected.id);
                const nextIndex = matchedIndex >= 0 ? matchedIndex : Math.max(0, Math.min(3, originalIndex));
                setChoice(nextIndex);
                 setScreen(previous => previous && previous !== "spiral" ? previous : "assembled");
                const selected = updated[nextIndex]!;
                offer("The continued design is ready. " + openLine(selected, nextIndex === 3));
              } else {
                if (actual.pathways.length === 3) {
                  // Reveal the four REAL pathways without pictures. A picture
                  // and inspection controls open only when the user chooses one.
                  setChoice(0);
                  setScreen("spiral");
                  offer(guideFor(actual) + " Choose Claude, Grok, OpenAI, or BLEND to enter a pathway.");
                } else {
                  // A single governed delivery must not be dressed up as
                  // four fabricated model answers.
                  setChoice(0);
                  setScreen("assembled");
                  offer(guideFor(actual));
                }
              }
              // Her visible knowledge growth is tied to the original persisted
              // Δ receipt, never to an unverified response or user engagement.
              if (governedPersisted(run) && typeof run.runtime_revision === "number" &&
                  Number.isInteger(run.runtime_revision) && run.runtime_revision > 0) {
                setVerifiedRevision(run.runtime_revision);
              }
              setGovernedStatus("ASCENSION delivered a governed result.");
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
            // Report the original runtime's recorded outcome, never substitute
            // a vague connection failure when a capability is unavailable.
            const actualReason = run.error?.trim() ||
              (run.outcome_status ? "Governed outcome: " + run.outcome_status : "") ||
              "The runtime did not provide an error message.";
            setError("ASCENSION governed execution " + run.status + ": " + actualReason.slice(0, 350));
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
          if (terminal && generation.current === token) {
            if (governedWatch.current) clearInterval(governedWatch.current);
            governedWatch.current = null;
            loadingRef.current = false;
            setLoading(false);
          }
        }
      };
      await poll();
      if (generation.current === token && !terminal && governedWatch.current === null)
        governedWatch.current = setInterval(() => { void poll(); }, 3500);
    } catch (cause) {
      if (generation.current === token) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError("ENGAGE submission failed: " + message.slice(0, 350));
        loadingRef.current = false;
        setLoading(false);
      }
    } finally {
      // Do not re-enable ENGAGE while the governed runtime is still processing.
      // The poll's terminal path clears loading after a delivered result or error.
    }
  }

  engageRef.current = () => { void engage(); };

  function stop() {
    generation.current += 1;
    abort.current?.abort();
    if (governedWatch.current) clearInterval(governedWatch.current);
    governedWatch.current = null;
    loadingRef.current = false;
    setLoading(false);
    offer("Stopped. The book can wait until you want to try again.");
  }

  const readings: PathwayReading[] = result
    ? [...result.pathways, result.blend].map((path, index) => ({
        title: path.title,
        line: cardLine(path.summary),
        blend: index === 3,
        summary: path.summary,
        imageUrl: path.imageUrl,
        blueprintUrl: path.blueprintUrl,
        modelUrl: path.modelUrl,
        parts: path.parts,
      }))
    : [];

  function show(next: DesignedTarget) {
    if (next === "book") {
      setScreen(null);
      offer("The book is here whenever another reading would help.");
      return;
    }
    if (next === "spiral") {
      if (result?.pathways.length === 3) {
        setScreen("spiral");
        offer("Your four pathways are here. Tell me which one to open.");
      }
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
    else if (next === "spiral") offer("Let's return to the design we're developing.");
    setScreen(next);
  }

  function openPathway(index: number) {
    const path = index === 3 ? result?.blend : result?.pathways[index];
    if (!path) return;
    setChoice(index);
    setScreen("assembled");
    // Introduce the selected picture and its actual delivered components,
    // without inventing a physical location, function, or measurement.
    const picture = path.imageUrl || path.modelUrl
      ? "This is the selected design."
      : "A design picture has not been delivered for this pathway.";
    const componentReading = path.parts.length
      ? "The delivered components are: " + path.parts.map(part => {
          const details = [
            part.name,
            part.location ? "where it belongs: " + part.location : "",
            part.purpose ? "what it does: " + part.purpose : "",
          ].filter(Boolean);
          return details.join(", ");
        }).join("; ") + "."
      : "Component details have not been delivered yet.";
    offer([openLine(path, index === 3), picture, componentReading].join(" "));
  }

  function explainPart(part: Part) {
    offer([
      part.name,
      part.location ? "Where: " + part.location : "Its location is not yet described in the delivered result.",
      part.purpose ? "Does: " + part.purpose : "Its function is not yet described in the delivered result.",
    ].join(". "));
  }

  function buildOnResult() {
    if (!result || !activeRun.current) return;
    const selected = result.pathways[choice] ?? result.blend;
    continuation.current = { ...activeRun.current, selected, blend: selected.id === result.blend.id };
    objectiveRef.current = "";
    setObjective("");
    setError("");
    offer("Tell me what you want to build on this design.");
    if (!talking) listenForObjective(true);
  }

  // Natural spoken changes continue the SAME verified run; never silently alter geometry.
  guideCommandRef.current = spoken => {
    if (!result) return false;
    const active = result.pathways[choice] ?? result.blend;
    if (result.pathways.length === 3 && /^(?:show|open|back to|return to) (?:the )?pathways$/.test(spoken)) {
      show("spiral"); return true;
    }
    if (result.pathways.length === 3) {
      const choices = [...result.pathways, result.blend];
      const match = spoken.match(/^(?:open|enter|choose|select) (?:pathway )?(one|two|three|four|1|2|3|4|blend|claude|grok|openai|chatgpt)$/);
      const names: Record<string, number> = { one: 0, two: 1, three: 2, four: 3, "1": 0, "2": 1, "3": 2, "4": 3, blend: 3 };
      const number = match?.[1] ? names[match[1]] : undefined;
      const named = match?.[1] ? choices.findIndex(path => path.title.toLowerCase().includes(match[1]!)) : -1;
      const index = number ?? named;
      if (index !== undefined && index >= 0 && index < 4) { openPathway(index); return true; }
    }
    if (/^(?:rotate|turn) (?:left|right)$/.test(spoken)) {
      if (!active.modelUrl) {
        offer("I need the actual 3D model before I can rotate this design in space.");
      } else {
        setRotationRequest(n => n + (spoken.endsWith("right") ? 1 : -1));
      }
      return true;
    }
    if (/^(?:zoom in|zoom out)$/.test(spoken)) {
      setZoomRequest(n => n + (spoken.endsWith("in") ? 1 : -1));
      return true;
    }
    const view = spoken.replace(/^(?:show|open|view|go to)\\s+/, "");
    const views: Record<string, DesignedScreen> = {
      blueprint: "blueprint", dissect: "dissect", explode: "exploded",
      exploded: "exploded", implode: "imploded", imploded: "imploded",
      assembled: "assembled", assembly: "assembled",
    };
    if (views[view]) { show(views[view]); return true; }
    if (/^(?:explain|explain this|what is this|what does this do|tell me about this|how does this work)$/.test(spoken)) {
      offer(openLine(active, active.id === result.blend.id)); return true;
    }
    const part = active.parts.find(item => spoken.includes(item.name.toLowerCase()));
    if (part && /^(?:explain|what|where|describe|tell)/.test(spoken)) {
      explainPart(part); return true;
    }
    // Existing governed continuation accepts a modification as an objective.
    if (/^(?:add|remove|replace|change|modify|make|move|increase|decrease|extend|reduce)\\b/.test(spoken) && activeRun.current) {
      continuation.current = { ...activeRun.current, selected: active, blend: active.id === result.blend.id };
      objectiveRef.current = spoken.slice(0, 4000);
      setObjective(objectiveRef.current);
      engageRef.current();
      return true;
    }
    return false;
  };

  const treeState = result && !loading ? "revealed" : loading ? "creating" : listening ? "listening" : "welcome";
  const currentDesign = result ? result.pathways[choice] ?? result.blend : null;
  const showingPathways = Boolean(result?.pathways.length === 3 && screen === "spiral");
  const currentView = screen && ["assembled", "blueprint", "dissect", "exploded", "imploded"].includes(screen)
    ? screen as "assembled" | "blueprint" | "dissect" | "exploded" | "imploded"
    : "assembled";

  return <div className="ascension-world living-tree-world relative isolate mx-auto w-full max-w-none">
    <section aria-label="ASCENSION Tree of Knowledge" className="ascension-command">
      <div className="ascension-stage living-tree-stage">
        <LivingTree state={treeState} verifiedRevision={verifiedRevision} />
        {!bookOpen && <section className="living-book-entry" aria-label="Open ASCENSION Book">
          <img src={BOOK} alt="Original ASCENSION closed Book" draggable={false}/>
          <div className="living-book-choices" role="group" aria-label="Choose a Book category">
            {(["Business Planner", "Build / Create", "Guidance"] as const).map(item =>
              <button type="button" key={item} onClick={() => chooseCategory(item)}>{item}</button>
            )}
          </div>
        </section>}
        {bookOpen && <>
          <div className="living-tree-conversation">
            <button type="button" onClick={() => listenForObjective()} disabled={loading}
              aria-pressed={listening} className="living-tree-microphone">
              {listening ? "STOP LISTENING" : "SPEAK TO TREE"}
            </button>
            {objective && <p className="living-tree-words" role="status">{objective}</p>}
            {textBackup && <label className="living-tree-text-backup">Your words
              <textarea rows={2} maxLength={4000} value={objective} placeholder="Enter your intent"
                onChange={event => { setObjective(event.target.value); objectiveRef.current = event.target.value; }}/>
            </label>}
            <button type="button" disabled={loading || !objective.trim()} onClick={() => void engage()}
              className="living-tree-submit">{loading ? "WORKING WITH YOUR INTENT…" : currentDesign ? "CONTINUE DESIGN" : "ENGAGE ASCENSION"}</button>
          </div>
          {showingPathways && result && <section className="living-pathways" aria-label="Four ASCENSION pathways">
            <h2>Choose a pathway</h2>
            <div className="living-pathway-options">
              {[...result.pathways, result.blend].map((path, index) => (
                <button type="button" key={path.id + index} className="living-pathway-option"
                  onClick={() => openPathway(index)}>
                  <span className="living-pathway-name">{index === 3 ? "BLEND" : path.title}</span>
                  <span className="living-pathway-description">{sentence(path.summary)}</span>
                  <span className="living-pathway-action">ENTER PATHWAY</span>
                </button>
              ))}
            </div>
          </section>}
          {!showingPathways && currentDesign && <TreeStudio
            design={{ ...currentDesign, files: result?.files ?? [] }} view={currentView} loading={loading}
            rotateRequest={rotationRequest} zoomRequest={zoomRequest}
            onView={next => show(next)} onExplainPart={explainPart} onContinue={buildOnResult}
            onBack={result?.pathways.length === 3 ? () => show("spiral") : undefined}/>}
          {loading && <p className="living-tree-message" role="status">The original ASCENSION engines are processing your intent. <button onClick={stop} type="button">Stop</button></p>}
          {error && <p className="living-tree-message living-tree-error" role="alert">{error}</p>}
          {governedStatus && <p className="living-tree-governed" role="status">{governedStatus}</p>}
          {internalKnowledge && <section className="living-tree-knowledge" aria-label="Original Knowledgeverse retrieval">
            {internalKnowledge}
          </section>}
          {voiceError && <p className="living-tree-voice-error" role="alert">{voiceError}</p>}
          {microphonePrompt && microphone === "checking" && <p className="living-tree-voice-error" role="status">Allow microphone access to speak with the Tree.</p>}
          {microphone === "unavailable" && <button type="button" className="living-tree-enable-mic" onClick={() => void requestMicrophone()}>Enable microphone</button>}
          <button type="button" className="living-tree-mute" aria-pressed={!talking} onClick={toggleTalking}>
            {talking ? "MUTE TREE" : "HEAR TREE"}
          </button>
        </>}
      </div>
    </section>
  </div>;
}
