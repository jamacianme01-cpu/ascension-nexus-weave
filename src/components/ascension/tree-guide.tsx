import { useEffect, useRef, useState } from "react";
import { TreePine } from "lucide-react";

/** The same spoken Tree stays available with the selected pathway and in reality inspection.
 * The server answers from selected design context; it cannot claim a physical test.
 */
type GuidePart = { name: string; purpose: string; location: string };
type Exchange = { role: "user" | "assistant"; content: string; selectedPart?: string; selectedPathway?: string };
const introduced = new Set<string>();
const conversations = new Map<string, Exchange[]>();
const conversationListeners = new Set<() => void>();
export type GuidePathway = {
  title: string;
  summary: string;
  steps: string[];
  parts: GuidePart[];
  tradeoffs?: string[];
};
type VoiceResult = { transcript?: string };
type VoiceRecognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<VoiceResult>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export function TreeGuide({ objective, pathway, enabled, onSpeak, compact = false, focusedPart = null, view = "assembled", partLocated = false, alternatives = [], introduce = false, locationSource = "unlocated", focusRevision = 0, experience = "design" }: {
  objective: string;
  pathway: GuidePathway;
  enabled: boolean;
  onSpeak: (answer: string) => void;
  compact?: boolean;
  focusedPart?: GuidePart | null;
  view?: string;
  partLocated?: boolean;
  alternatives?: GuidePathway[];
  introduce?: boolean;
  focusRevision?: number;
  experience?: "guidance" | "design";
  locationSource?: "reference-image"|"mesh"|"unlocated";
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [open, setOpen] = useState(true);
  const [conversation, setConversation] = useState<Exchange[]>(() => conversations.get(objective) ?? []);
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const microphone = useRef<VoiceRecognizer | null>(null);
  useEffect(() => {
    const refresh = () => setConversation(conversations.get(objective) ?? []);
    conversationListeners.add(refresh);
    return () => { conversationListeners.delete(refresh); };
  }, [objective]);
  useEffect(() => () => { pending.current?.abort(); microphone.current?.stop(); }, []);
  useEffect(() => {
    pending.current?.abort();
    setAnswer("");
    setError("");
    setQuestion("");
    setThinking(false);
    setConversation(conversations.get(objective) ?? []);
  }, [pathway.title, objective]);

  async function ask(value: string, replace = false, selectionName?: string, isPathway = false) {
    const text = value.trim();
    if (!text || (thinking && !replace) || text.length > 800) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    if(!selectionName)setQuestion(text);
    setThinking(true);
    setError("");
    try {
      const response = await fetch("/api/public/ascension/independent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          phase: "guide",
          objective,
          question: text,
          alternatives: alternatives.slice(0, 4).map(option => ({ title: option.title, summary: option.summary, tradeoffs: option.tradeoffs ?? [] })),
          history: (conversations.get(objective) ?? []).slice(-8),
          pathway: {
            experience,
            title: pathway.title,
            summary: pathway.summary,
            steps: pathway.steps.slice(0, 8),
            tradeoffs: pathway.tradeoffs ?? [],
            parts: pathway.parts.slice(0, 12),
            focused_part: focusedPart,
            current_view: view,
            part_located: partLocated,
            location_source: locationSource,
          },
        }),
      });
      const data: { answer?: string; error?: string } = await response.json();
      if (!response.ok || !data.answer?.trim())
        throw new Error(data.error || "The Tree could not complete that explanation.");
      if (!controller.signal.aborted) {
        const reply = data.answer.trim();
        setAnswer(reply);
        if(isPathway){
          introduced.add(JSON.stringify([objective,pathway.title]));
          if(introduced.size>48)introduced.delete(introduced.values().next().value!);
        }
        const remembered = selectionName ? (isPathway ? `Tell me about ${selectionName}` : `Explain ${selectionName}`) : text;
        const exchanges: Exchange[] = [...(conversations.get(objective) ?? []),
          { role: "user", content: remembered, ...(selectionName ? isPathway ? { selectedPathway: selectionName } : { selectedPart: selectionName } : {}) }, { role: "assistant", content: reply }].slice(-12) as Exchange[];
        conversations.set(objective, exchanges);
        if (conversations.size > 12) conversations.delete(conversations.keys().next().value!);
        conversationListeners.forEach(refresh => refresh());
        setConversation(exchanges);
        if(!selectionName)setQuestion(current=>current===text?"":current);
        if (enabled) onSpeak(reply);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The Tree could not answer.");
    } finally {
      if (!controller.signal.aborted) setThinking(false);
    }
  }

  useEffect(() => {
    if (focusedPart) void ask(`Explain ${focusedPart.name}: how it works in this design, where it belongs, and what it connects to. Explain this component, not the surrounding scene.`, true, focusedPart.name);
  }, [focusedPart?.name,focusRevision]);

  useEffect(() => {
    if(!introduce || introduced.has(JSON.stringify([objective,pathway.title])))return;
    // Defer so StrictMode's discarded mount cannot send a duplicate introduction.
    const timer=window.setTimeout(()=>void ask(experience==="guidance"?"Help me use this approach in my real situation. Give one practical first action and ask the most useful question to tailor the next step. Do not invent my numbers or suggest building a financial app.":"Explain the design already on screen: what it is and how its main parts work together. Use two short sentences, at most 45 words. Do not assign research or ask me to specify the design.", true, pathway.title, true),0);
    return()=>window.clearTimeout(timer);
  },[introduce,objective,pathway.title,experience]);

  function listen() {
    if (listening) { microphone.current?.stop(); return; }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => VoiceRecognizer;
      webkitSpeechRecognition?: new () => VoiceRecognizer;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("This browser has no speech input. You can type your question.");
      return;
    }
    try {
      const recognizer = new Recognition();
      microphone.current = recognizer;
      recognizer.lang = "en-US";
      recognizer.continuous = false;
      recognizer.interimResults = false;
      recognizer.onresult = event => {
        const text = event.results[0]?.[0]?.transcript?.trim() ?? "";
        if (text) { setQuestion(text); void ask(text); }
      };
      recognizer.onerror = () => { setListening(false); setError("Microphone input stopped. You can type your question."); };
      recognizer.onend = () => setListening(false);
      recognizer.start();
      setListening(true);
    } catch {
      setListening(false);
      setError("Microphone unavailable. You can type your question.");
    }
  }

  return <div className={"rounded-xl border border-amber-300/25 bg-[#051b2a]/95 p-3 text-sm text-foreground " +
    (compact ? "w-full" : "my-4")} aria-label="Speak with the Tree of Knowledge">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
        className="flex items-center gap-2 rounded-full border border-amber-200/45 px-3 py-2 text-amber-100">
        <TreePine aria-hidden="true" size={18} /> TREE OF KNOWLEDGE {open ? "▴" : "▾"}
      </button>
      {open && enabled && answer && <button type="button" onClick={() => onSpeak(answer)}
        className="rounded-full border border-amber-200/45 px-3 py-2 text-amber-100">HEAR AGAIN</button>}
    </div>
    {open && <>
      <p className="mt-2 text-xs text-sky-100/80">Let's work on it together. Ask a question or tell me what you'd like to change.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(focusedPart ? [`How does ${focusedPart.name} connect?`, `What should we change about ${focusedPart.name}?`] : experience==="guidance"
          ? (alternatives.length ? ["Help me choose between these pathways", "What could I be overlooking?", "What is my first practical step?"] : ["What would you improve?", "What is my first practical step?"])
          : pathway.steps.length===0 && pathway.parts.length===0
            ? ["Which design matches what I asked?", "How do these designs differ?", "What has already been decided?"]
            : ["How does this design work?", "What should we change in this design?", "How do these parts connect?"]).map(prompt => <button type="button" key={prompt}
          disabled={thinking} onClick={() => void ask(prompt)}
          className="rounded-full border border-amber-200/30 px-3 py-1 text-xs text-amber-100 disabled:opacity-40">{prompt}</button>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input type="text" aria-label="Ask the Tree" value={question} maxLength={800}
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") void ask(question); }}
          placeholder="Talk with the Tree"
          className="min-w-[10rem] flex-1 rounded-lg border border-amber-200/30 bg-[#07111d] px-3 py-2 text-foreground"/>
        <button type="button" onClick={listen} aria-pressed={listening}
          className="rounded-full border border-amber-200/45 px-3 py-2 text-amber-100">
          {listening ? "STOP LISTENING" : "SPEAK"}
        </button>
        <button type="button" disabled={!question.trim() || thinking} onClick={() => void ask(question)}
          className="rounded-full border border-amber-200/45 px-3 py-2 text-amber-100 disabled:opacity-40">
          {thinking ? "CONNECTING…" : "ASK"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-red-200">{error}</p>}
      <div className="mt-3 space-y-2" role="log" aria-label="Conversation with the Tree" aria-live="polite">
        {conversation.map((message,index)=>{
          const previous=conversation[index-1];
          if(message.role==="assistant"&&(previous?.selectedPathway||previous?.selectedPart))return <details key={index} className="text-sky-100">
            <summary className="cursor-pointer text-xs text-gold">Read spoken explanation</summary>
            <p className="mt-2 whitespace-pre-wrap leading-6">{message.content}</p>
          </details>;
          return <p key={index} className={"whitespace-pre-wrap leading-6 "+(message.role==="user"?"text-amber-100":"text-sky-100")}>
            <span className="mr-2 text-xs opacity-70">{message.selectedPathway?"Selected pathway":message.selectedPart?"Selected part":message.role==="user"?"You":"Tree"}</span>{message.selectedPathway ?? message.selectedPart ?? message.content}</p>;
        })}
      </div>
    </>}
  </div>;
}
