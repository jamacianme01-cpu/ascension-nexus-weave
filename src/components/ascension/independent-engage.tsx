import { useEffect, useRef, useState } from "react";
import { TreePathwayCarousel } from "@/components/ascension/tree-pathway-carousel";
import { TreeGuide } from "@/components/ascension/tree-guide";
import { V1HunyuanPathway } from "@/components/ascension/v1-hunyuan-pathway";
import { briefSpokenAnswer, interpretVoiceCommand, voiceCommandSpeech, type VoiceCommand } from "@/lib/ascension/spoken-answer";
import { availableTreeVoice, selectTreeVoice } from "@/lib/ascension/tree-speech";

type Part = { name: string; purpose: string; location: string };
type BusinessPlan = {
  executive_summary: string; customers_and_market: string; operations_and_inventory: string;
  marketing_and_sales: string; revenue_and_cost_baseline: string; profit_improvement: string;
  financial_projection: string; assumptions_and_missing_data: string; milestones_and_risks: string;
};
const PLAN_LABELS: { field: keyof BusinessPlan; label: string }[] = [
  { field: "executive_summary", label: "Executive summary" },
  { field: "customers_and_market", label: "Customers and market" },
  { field: "operations_and_inventory", label: "Operations and inventory" },
  { field: "marketing_and_sales", label: "Marketing and sales" },
  { field: "revenue_and_cost_baseline", label: "Revenue and cost baseline" },
  { field: "profit_improvement", label: "Profit improvement" },
  { field: "financial_projection", label: "Financial projections" },
  { field: "assumptions_and_missing_data", label: "Assumptions and missing data" },
  { field: "milestones_and_risks", label: "Milestones and risks" },
];
type Pathway = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[]; provider?: string; plan?: BusinessPlan };
type Result = { experience?: "guidance" | "design"; introduction: string; pathways: Pathway[]; blend: Pathway & { blend_reason: string };
  contributors: string[]; unavailable: string[]; providerErrors: string[]; mode: string; verified: false; governance: string; persistence: string; specialty_lead?: string };
type ObjectiveSection = "business" | "build" | "guidance";
type ObjectiveAttachment = { name: string; mime: string; text?: string; data_url?: string };
const SECTIONS: { id: ObjectiveSection; title: string; lead: string }[] = [
  { id: "business", title: "Business Planner", lead: "Claude" },
  { id: "build", title: "Build / Create", lead: "OpenAI" },
  { id: "guidance", title: "Guidance", lead: "Grok" },
];
const ACCEPTED_DOCUMENT = /\.(pdf|docx|txt|md|csv|json)$/i;
const TEXT_DOCUMENT = /\.(txt|md|csv|json)$/i;

/** Files stay in this browser until ENGAGE; no hidden upload or persistence. */
async function readObjectiveFile(file: File): Promise<ObjectiveAttachment> {
  const name = file.name.slice(0, 140);
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/i.test(name)) {
    if (file.size > 15_000_000) throw new Error(name + " is too large for a picture.");
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Cannot read " + name + ". Try JPEG or PNG."); });
    try {
      const ratio = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Camera picture could not be prepared.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data_url = canvas.toDataURL("image/jpeg", 0.75);
      if (data_url.length > 2_400_000) throw new Error(name + " is still too large after resizing.");
      return { name: /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, ".jpg") : name + ".jpg", mime: "image/jpeg", data_url };
    } finally { bitmap.close(); }
  }
  if (!ACCEPTED_DOCUMENT.test(name)) throw new Error("Unsupported file type: " + name);
  if (TEXT_DOCUMENT.test(name)) {
    if (file.size > 64_000) throw new Error(name + " exceeds the 64 KB text-document limit.");
    return { name, mime: "text/plain", text: await file.text() };
  }
  if (file.size > 5_000_000) throw new Error(name + " exceeds the 5 MB document limit.");
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read " + name));
    reader.readAsDataURL(file);
  });
  const mime = name.toLowerCase().endsWith(".pdf") ? "application/pdf" :
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  // Some browsers omit or mislabel Word MIME types. Preserve the actual bytes,
  // but send the canonical MIME of the accepted filename.
  const encoded = rawUrl.slice(rawUrl.indexOf(",") + 1);
  return { name, mime, data_url: "data:" + mime + ";base64," + encoded };
}

const BOOK_SCENE = "/approved-scene/01-closed-book.jpg";
const SCENE = "/approved-scene/ascension-tree-behind-book-hq.jpg";
const GREETING = "Welcome to ASCENSION. What are we working on today?";
type VoiceHeard = { transcript?: string };
type VoiceSession = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results?: ArrayLike<ArrayLike<VoiceHeard>> }) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};

let speechSequence = 0;
let activeUtterance: SpeechSynthesisUtterance | null = null;
function say(text: string, onStarted?: () => void, onUnavailable?: (message: string) => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  const sequence = ++speechSequence;
  // React to actual speech playback without adding another Tree image.
  document.documentElement.classList.remove("ascension-tree-is-speaking");
  const synth = window.speechSynthesis;
  // Speak in the same turn as the click. Waiting for the voice list drops
  // the browser's user-activation, so playback can "succeed" and stay silent.
  const interrupted = synth.speaking || synth.pending;
  try { synth.cancel(); synth.resume(); } catch { return; }
  const listed = synth.getVoices?.() ?? [];
  const voice = selectTreeVoice(listed);
  // A named voice is preferred, but the browser's default voice must not
  // prevent the Tree from speaking when the user enters its world.
  if (!voice && listed.length === 0) void availableTreeVoice(synth);
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
  let started = false;
  const next = () => {
    if (sequence !== speechSequence || index >= chunks.length) {
      if (sequence === speechSequence) {
        activeUtterance = null;
        document.documentElement.classList.remove("ascension-tree-is-speaking");
      }
      return;
    }
    const words = new SpeechSynthesisUtterance(chunks[index++]!);
    activeUtterance = words;
    if (voice) words.voice = voice;
    words.lang = voice?.lang ?? "en-US";
    words.rate = 0.96;
    words.pitch = 1;
    words.onstart = () => {
      if (sequence !== speechSequence) return;
      started = true;
      document.documentElement.classList.add("ascension-tree-is-speaking");
      onStarted?.();
    };
    words.onend = next;
    words.onerror = (event: Event) => {
      if (sequence !== speechSequence) return;
      const reason = "error" in event ? String((event as { error?: string }).error ?? "") : "";
      if (reason === "canceled" || reason === "interrupted") return;
      activeUtterance = null;
      document.documentElement.classList.remove("ascension-tree-is-speaking");
      if (!started) onUnavailable?.("This browser blocked spoken playback. Tap Hear the Tree and I'll speak.");
    };
    try { synth.speak(words); } catch {
      activeUtterance = null;
      document.documentElement.classList.remove("ascension-tree-is-speaking");
    }
  };
  // Chrome drops an utterance spoken in the same turn as cancel().
  if (interrupted) window.setTimeout(next, 60);
  else next();
}
function stopVoice() {
  speechSequence += 1;
  activeUtterance = null;
  if (typeof document !== "undefined") document.documentElement.classList.remove("ascension-tree-is-speaking");
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
  onPicture?: (ready: boolean) => void;
  prompt?: { id: number; text: string } | null;
  inspectionCommand?: { id: number; command: VoiceCommand } | null;
}) {
  if(props.experience==="guidance")return <section className="rounded-2xl border border-gold/30 bg-[#04101cdd] p-4 sm:p-6" aria-label="Selected guidance pathway">
    <h3 className="mb-3 text-xl text-gold">{props.path.title}</h3>
    <p className="mb-4 text-sm leading-6">{props.path.summary}</p>
    <TreeGuide objective={props.objective} prompt={props.prompt ?? null} pathway={props.path} alternatives={props.alternatives} experience="guidance" introduce portrait enabled={props.speakingEnabled} onSpeak={props.onSpeak}/>
    {props.path.plan && <section className="mt-6 space-y-4" aria-label="Business plan">
      <h4 className="text-lg text-gold">Business plan</h4>
      {PLAN_LABELS.map(({ field, label }) => <div key={field}>
        <h5 className="text-sm font-semibold text-gold">{label}</h5>
        <p className="mt-1 whitespace-pre-line text-sm leading-6">{props.path.plan?.[field]}</p>
      </div>)}
    </section>}
  </section>;
  return <V1HunyuanPathway
    path={props.path} alternatives={props.alternatives} objective={props.objective} modelCache={props.modelCache} imageCache={props.imageCache}
    onSpeak={props.onSpeak} speakingEnabled={props.speakingEnabled} onPicture={props.onPicture}
    prompt={props.prompt ?? null} inspectionCommand={props.inspectionCommand ?? null} />;
}

/** Hosted Tree entry. The first model answer is backend context, not a public essay. */
export function IndependentEngage() {
  const [objective, setObjective] = useState("");
  const [section, setSection] = useState<ObjectiveSection | null>(null);
  const [enteredTree, setEnteredTree] = useState(false);
  const [attachments, setAttachments] = useState<ObjectiveAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
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
  const [voiceOn, setVoiceOn] = useState(false);
  const [voicePrompt, setVoicePrompt] = useState<{ id: number; text: string } | null>(null);
  const [inspectionCommand, setInspectionCommand] = useState<{ id: number; command: VoiceCommand } | null>(null);
  const voiceSerial = useRef(0);
  const applyVoiceRef = useRef<(text: string) => void>(() => {});
  const [designPicture, setDesignPicture] = useState(false);
  const [designSettled, setDesignSettled] = useState(false);
  const view = useRef<HTMLElement | null>(null);
  const designView = useRef<HTMLElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const continuationContext = useRef("");
  const modelCache = useRef(new Map<string, ArrayBuffer>());
  const imageCache = useRef(new Map<string, string>());
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); stopVoice(); }, []);

  function enterCategory(id: ObjectiveSection) {
    // Selecting a category is the user's entry gesture, enabling speech.
    stopVoice();
    setSection(id);
    setEnteredTree(true);
    setVoiceNotice("");
    setVoiceOn(true);
    setTalking(true);
    const question = id === "business" ? "Tell me about your business. What do you want to work on?"
      : id === "build" ? "What would you like to create?"
      : "What would you like help with?";
    say(GREETING + " " + question, () => setVoiceNotice(""), setVoiceNotice);
  }

  async function addFiles(files: File[]) {
    if (!files.length) return;
    setAttachmentError("");
    if (attachments.length + files.length > 3) {
      setAttachmentError("Up to three files per objective.");
      return;
    }
    try {
      const read = await Promise.all(files.map(readObjectiveFile));
      const existingSize = attachments.reduce((total, item) =>
        total + (item.data_url?.length ?? item.text?.length ?? 0), 0);
      const addedSize = read.reduce((total, item) =>
        total + (item.data_url?.length ?? item.text?.length ?? 0), 0);
      if (existingSize + addedSize > 7_500_000)
        throw new Error("These files exceed the 7.5 MB combined upload limit. Select smaller documents.");
      const combinedText = [...attachments, ...read].reduce((total, item) =>
        total + (item.text?.length ?? 0), 0);
      if (combinedText > 64_000)
        throw new Error("Combined text documents exceed 64,000 characters.");
      setAttachments(previous => [...previous, ...read].slice(0, 3));
    } catch (cause) {
      setAttachmentError(cause instanceof Error ? cause.message : "Unable to read the selected file.");
    }
  }

  async function generatePathways(text: string, controller: AbortController, token: number) {
    setPathwayError("");
    try {
      const response = await fetch("/api/public/ascension/independent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective: text, phase: "pathways", section, attachments, firstAnswer: continuationContext.current }),
        signal: controller.signal,
      });
      const data: Result & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Pathway synthesis did not complete.");
      if (!Array.isArray(data.pathways) || data.pathways.length !== 3 || !data.blend)
        throw new Error("The answer engine did not deliver three pathways and a blend.");
      if (generation.current !== token) return;
      setResult(data);
      setChoice(null);
      if (talking) say("I have four approaches. Choose one and I can explain it.");
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

  async function engage(override?: string, existingContext = "") {
    const text = (override ?? objective).trim();
    if (!enteredTree || !section || text.length < 3 || loading) return;
    const token = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    continuationContext.current = existingContext;
    stopVoice();
    // Keep private refinement context out of the visible objective field.
    if (!override) setObjective(text);
    modelCache.current.clear(); imageCache.current.clear();
    setRequested(text);
    setVoicePrompt(null);
    setLoading(true);
    setError("");
    setPathwayError("");
    setResult(null);
    setRefinement("");
    setChoice(null);setOrbPreview(null);setDesignPicture(false);setDesignSettled(false);
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
    const change = changes.trim();
    // Preserve what has already been produced. A refinement is not a new
    // independent objective and must not erase the selected plan or design.
    const context = JSON.stringify({
      selected_pathway: { title: path.title, summary: path.summary,
        steps: path.steps, tradeoffs: path.tradeoffs, parts: path.parts,
        ...(path.plan ? { plan: path.plan } : {}) },
      requested_change: change || "Develop the selected result further",
    }).slice(0, 8500);
    const next = (originalObjective + "\nBuild on the selected pathway: " + path.title +
      (change ? "\nChange or improve: " + change :
        "\nDevelop the selected result further without restarting or repeating completed actions."))
      .slice(0, 2400);
    void engage(next, context);
  }

  function reset() {
    generation.current += 1;
    abort.current?.abort();
    stopVoice();
    modelCache.current.clear(); imageCache.current.clear();
    setObjective(""); setRequested(""); setError(""); setResult(null);
    continuationContext.current = "";
    setSection(null); setEnteredTree(false); setAttachments([]); setAttachmentError("");
    setRefinement(""); setPathwayError(""); setLoading(false);
    setStage("idle"); setChoice(null);setOrbit(0);setOrbPreview(null);setDesignPicture(false);setDesignSettled(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const choices = result ? [...result.pathways, result.blend] : [];
  const selected = choice === null ? null : choices[choice];
  const experience = result?.experience ?? (section === "build" ? "design" : "guidance");
  const previewPath = orbPreview === null ? null : choices[orbPreview];
  const spokenPreview = (path: Pathway) => {
    return path.title + ". " + briefSpokenAnswer(path.summary,32);
  };
  function hearPathway(index:number) {
    const path=choices[index];if(!path)return;
    setOrbit(index);setOrbPreview(index);setTalking(true);setVoiceNotice("");
    void say(spokenPreview(path),()=>setVoiceNotice(""),setVoiceNotice);
  }
  function applyVoice(text: string) {
    const command = interpretVoiceCommand(text);
    const screen = !enteredTree ? "book" : choice !== null ? "design" : result ? "orbs" : "objective";
    const speak = (line: string) => { setVoiceNotice(""); say(line, () => setVoiceNotice(""), setVoiceNotice); };
    if (!command) {
      if (screen === "book") { speak("Say Business Planner, Build, or Guidance."); return; }
      if (screen === "objective") setObjective(text.slice(0, 2400));
      voiceSerial.current += 1;
      setVoicePrompt({ id: voiceSerial.current, text: text.slice(0, 800) });
      return;
    }
    if (command.kind === "section") { enterCategory(command.section); return; }
    if (command.kind === "new-objective") { reset(); return; }
    if (command.kind === "engage") {
      if (!enteredTree) { speak("Choose a section first."); return; }
      if (result && choice === null) { speak("Say enter to open the pathway in front of you."); return; }
      const ready = (objective || requested).trim();
      if (ready.length < 3) { speak("Tell me the objective first."); return; }
      void engage(ready);
      return;
    }
    if (command.kind === "next" || command.kind === "previous") {
      if (!result || choice !== null || choices.length === 0) { speak("Pathways are not on screen."); return; }
      const count = choices.length;
      const delta = command.kind === "next" ? 1 : -1;
      setOrbPreview(null);
      setOrbit(index => (index + delta + count) % count);
      speak(voiceCommandSpeech(command));
      return;
    }
    if (command.kind === "hear") {
      if (!result || choice !== null || choices.length === 0) { speak("Pathways are not on screen."); return; }
      const index = command.target === "blend" ? choices.length - 1
        : command.target === "active" ? orbit % choices.length
        : command.target;
      if (index < 0 || index >= choices.length) { speak("That pathway is not on screen."); return; }
      hearPathway(index);
      return;
    }
    if (command.kind === "enter") {
      if (!result || choices.length === 0) { speak("Pathways are not on screen."); return; }
      const index = orbPreview ?? (orbit % choices.length);
      stopVoice();
      setDesignPicture(false); setDesignSettled(false); setChoice(index); setRefinement("");
      speak("Entering the pathway.");
      return;
    }
    if (command.kind === "back") {
      if (choice === null) { speak(result ? "You are already with the pathways." : "Choose a section and tell me the objective."); return; }
      stopVoice(); setDesignPicture(false); setDesignSettled(false); setChoice(null);
      speak("Back to the pathways.");
      return;
    }
    if (choice === null || experience !== "design") { speak("Open a build pathway before using that view."); return; }
    voiceSerial.current += 1;
    setInspectionCommand({ id: voiceSerial.current, command });
  }
  applyVoiceRef.current = applyVoice;


  useEffect(() => {
    if (!voiceOn) return;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => VoiceSession;
      webkitSpeechRecognition?: new () => VoiceSession;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice("This browser has no speech input. The buttons still work.");
      setVoiceOn(false);
      return;
    }
    let stopped = false;
    let active: VoiceSession | null = null;
    const arm = () => {
      if (stopped) return;
      if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
        window.setTimeout(arm, 350);
        return;
      }
      try {
        const recognizer = new Recognition();
        active = recognizer;
        recognizer.lang = "en-US";
        recognizer.continuous = false;
        recognizer.interimResults = false;
        recognizer.onresult = event => {
          const heard = event.results?.[0]?.[0]?.transcript?.trim() ?? "";
          if (heard) applyVoiceRef.current(heard);
        };
        recognizer.onerror = event => {
          if (stopped) return;
          if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
            stopped = true;
            setVoiceNotice("Microphone access was denied. The buttons still work.");
            setVoiceOn(false);
            return;
          }
          window.setTimeout(arm, 700);
        };
        recognizer.onend = () => { if (!stopped) window.setTimeout(arm, 280); };
        recognizer.start();
      } catch {
        if (!stopped) {
          setVoiceNotice("Microphone unavailable. The buttons still work.");
          setVoiceOn(false);
        }
      }
    };
    arm();
    return () => {
      stopped = true;
      try { active?.abort(); } catch { /* The recognizer may already be stopped. */ }
    };
  }, [voiceOn]);

  // Move the viewport only after React has mounted the destination screen.
  // The previous scrollTo inside the click ran before the cards disappeared.
  useEffect(() => {
    if (!result) return;
    // Leave the opening screen in place until the selected design has actually loaded.
    if (choice !== null && experience === "design" && !designSettled) return;
    const frame = window.requestAnimationFrame(() => {
      (choice === null ? view.current : designView.current)?.scrollIntoView({
        behavior: "instant", block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [choice, result, designSettled, experience]);

  return <div className="ascension-world relative isolate mx-auto w-full max-w-none"
    data-book-sequence={stage === "idle" ? undefined : stage} data-has-run={result ? "true" : undefined}
    data-realities={choice !== null ? "true" : undefined}
    data-design-ready={designPicture ? "true" : undefined}>
    <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
      <button type="button" aria-pressed={voiceOn} onClick={() => setVoiceOn(on => !on)}
        className="min-h-12 rounded-full border border-gold/55 px-5 text-sm text-gold">
        {voiceOn ? "VOICE ON" : "VOICE"}
      </button>
      {voiceOn && <p role="status" className="text-sm text-gold">Listening. Say a pathway, Blueprint, Dissect, or the picture.</p>}
    </div>
    {!enteredTree && <section aria-label="ASCENSION Book entrance" className="ascension-command ascension-book-entry">
      <img className="ascension-book-art" src={BOOK_SCENE} alt="The ASCENSION Knowledge Book" draggable={false} />
      <div className="ascension-book-categories" role="group" aria-label="Choose your ASCENSION section">
        {SECTIONS.map(item => <button key={item.id} type="button" onClick={() => enterCategory(item.id)}>
          {item.title}
        </button>)}
      </div>
    </section>}
    {enteredTree && choice === null && !result && <section aria-label="ASCENSION Tree world" className="ascension-command">
      <div className="ascension-stage">
        <div className="ascension-scene-hero" aria-hidden="true">
          <img className="ascension-tree-scene" src={SCENE} alt="" draggable={false} />
        </div>
        <div className="ascension-entry-guide" aria-label="Speak to the Tree">
          <TreeGuide objective="Explore an idea with ASCENSION" prompt={voicePrompt}
            pathway={{ title: "Your objective", summary: objective || "Explore an idea with ASCENSION", steps: [], parts: [] }}
            experience={experience} enabled={talking} onSpeak={text => { if (talking) say(text); }} />
          {voiceNotice && <p role="status" className="ascension-voice-notice">{voiceNotice}</p>}
        </div>
        <label htmlFor="objective">What do you want to accomplish?</label>
        <textarea id="objective" rows={3} value={objective} maxLength={2400} disabled={loading}
          aria-label="What do you want to accomplish?" placeholder="What do you want to accomplish?"
          onChange={event => setObjective(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !loading) { event.preventDefault(); void engage(); } }}
        />
        <div className="ascension-evidence-tools relative z-10 flex flex-wrap items-center gap-3 text-xs">
          <label className="cursor-pointer rounded-full border border-gold/40 px-4 py-2 text-gold">
            Upload pictures
            <input className="sr-only" type="file" accept="image/*" multiple disabled={loading}
              onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void addFiles(files); }}/>
          </label>
          <label className="cursor-pointer rounded-full border border-gold/40 px-4 py-2 text-gold">
            Take picture
            <input className="sr-only" type="file" accept="image/*" capture="environment" disabled={loading}
              onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void addFiles(files); }}/>
          </label>
          <label className="cursor-pointer rounded-full border border-gold/40 px-4 py-2 text-gold">
            Upload documents
            <input className="sr-only" type="file" accept=".pdf,.docx,.txt,.md,.csv,.json" multiple disabled={loading}
              onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void addFiles(files); }}/>
          </label>
          {attachments.map((item, index) => <span key={index} className="rounded-full border border-gold/30 px-3 py-2">
            {item.name} <button type="button" disabled={loading} aria-label={`Remove ${item.name}`}
              onClick={() => setAttachments(current => current.filter((_, i) => i !== index))}>×</button>
          </span>)}
        </div>
        {attachmentError && <p role="alert" className="text-sm text-red-200">{attachmentError}</p>}
        {attachments.length > 0 && <p className="text-xs text-foreground/70">Files are sent to the configured answer provider when you engage. They are not saved to your ASCENSION library.</p>}
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
        <h2 className="text-lg text-gold">{section !== "build"?"Explore your possibilities":"Explore your designs"}</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={reset} className="rounded-full border border-gold/40 px-4 py-2 text-gold">New objective</button>
        </div>
      </div>
      {result.specialty_lead === "unavailable" && <p role="status" className="text-xs text-foreground/70">
        The assigned specialist is not connected. Actual model contributions are identified in the pathways.
      </p>}
      <TreePathwayCarousel designs={choices.map(p => ({
        id: p.id, title: p.provider ? p.provider + " · " + p.title : p.title, summary: p.summary,
      }))} active={orbit % choices.length} onRotate={index=>{stopVoice();setOrbPreview(null);setOrbit(index);}}
        onOpen={hearPathway} />
      <div className="ascension-pathway-tree-voice">
        <TreeGuide objective={requested || objective} prompt={voicePrompt} pathway={{ title: "Your objective", summary: requested, steps: [], parts: [] }}
          experience={experience} alternatives={choices} enabled={talking} onSpeak={text => { if (talking) say(text); }}/>
      </div>
      {previewPath && <div className="flex flex-wrap items-center justify-center gap-3" aria-label="Pathway introduction">
        <button type="button" onClick={()=>hearPathway(orbPreview!)}
          className="rounded-full border border-gold/40 px-4 py-2 text-sm text-gold">HEAR AGAIN</button>
        <button type="button" onClick={()=>{stopVoice();setDesignPicture(false);setDesignSettled(false);setChoice(orbPreview);setRefinement("");}}
          className="rounded-full border border-primary/60 bg-primary/10 px-6 py-3 text-sm text-primary">ENTER PATHWAY</button>
        <details className="w-full text-center text-xs text-foreground/70">
          <summary className="cursor-pointer">Read introduction</summary>
          <p className="mx-auto mt-2 max-w-xl leading-6">{spokenPreview(previewPath)}</p>
        </details>
        {voiceNotice && <p role="status" className="w-full text-center text-sm text-gold">{voiceNotice} You can read the introduction or enter the pathway.</p>}
      </div>}
    </section>}
    {selected && <section ref={designView} className="ascension-knowledgeverse ascension-result-reveal mx-auto mt-5 min-h-[calc(100svh-3rem)] max-w-6xl space-y-5 p-4 sm:p-7"
      aria-label="Selected pathway design">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => { stopVoice(); setDesignPicture(false); setDesignSettled(false); setChoice(null); }}
          className="rounded-full border border-gold/50 px-5 py-2 text-sm text-gold">← BACK TO PATHWAYS</button>
      </div>
        <PathwayView key={selected.id} experience={experience} path={selected} alternatives={choices} objective={requested} modelCache={modelCache} imageCache={imageCache}
          prompt={voicePrompt} inspectionCommand={inspectionCommand}
          onPicture={(ready) => { setDesignPicture(ready); setDesignSettled(true); }}
          speakingEnabled={talking}
          onSpeak={text => { if (talking) say(text); }} />
        {experience==="guidance"&&<section className="rounded-xl border border-gold/25 bg-[#051b2a]/95 p-4 sm:p-6" aria-label="Choose your next step">
          <h3 className="text-lg text-gold">Next actions</h3>
          {"blend_reason" in selected && <p className="mt-3 text-sm leading-6">{String(selected.blend_reason)}</p>}
          {selected.tradeoffs.length > 0 && <div className="mt-4">
            <h4 className="text-sm font-semibold text-amber-100">What to weigh</h4>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">
              {selected.tradeoffs.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </div>}
          {selected.steps.length > 0 && <div className="mt-4">
            <h4 className="text-sm font-semibold text-sky-100">Your first steps</h4>
            {section === "business" ? <div className="ascension-business-plan-flow" role="list"
              aria-label="Business plan implementation sequence">
              {selected.steps.map((step, index) => <div role="listitem" key={index} className="ascension-business-step">
                <strong>{index + 1}</strong><span>{step}</span>
              </div>)}
            </div> : <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6">
              {selected.steps.map((step, index) => <li key={index}>{step}</li>)}
            </ol>}
          </div>}
        </section>}
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
