import { useEffect, useRef, useState } from "react";

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

export function TreeGuide({ objective, pathway, enabled, onSpeak, compact = false, portrait = false, focusedPart = null, view = "assembled", partLocated = false, alternatives = [], introduce = false, locationSource = "unlocated", focusRevision = 0, experience = "design" }: {
  objective: string;
  pathway: GuidePathway;
  enabled: boolean;
  onSpeak: (answer: string) => void;
  compact?: boolean;
  portrait?: boolean;
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

  return <div className={"ascension-tree-voice " + (compact ? "ascension-tree-voice-compact" : "")}
    aria-label="Speak with the Tree of Knowledge">
    {portrait && <button type="button" className="ascension-tree-character"
      aria-label="Speak to the Tree" title="Speak to the Tree" onClick={listen}
      aria-pressed={listening}>
      <img src="/approved-scene/ascension-tree-behind-book-hq.jpg"
        alt="Tree of Knowledge" draggable={false}/>
    </button>}
    <form className="ascension-tree-conversation" onSubmit={event => { event.preventDefault(); void ask(question); }}>
      <input type="text" aria-label="Ask the Tree" value={question} maxLength={800}
        onChange={event => setQuestion(event.target.value)}
        placeholder="Ask the Tree" disabled={thinking}/>
      {!portrait && <button type="button" onClick={listen} aria-pressed={listening}
        aria-label={listening ? "Stop speaking to the Tree" : "Speak to the Tree"}>
        {listening ? "STOP" : "SPEAK"}
      </button>}
      <button type="submit" disabled={!question.trim() || thinking}>
        {thinking ? "CONNECTING…" : "ASK"}
      </button>
    </form>
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
    {answer && <span className="sr-only" aria-live="polite">{answer}</span>}
    {conversation.length > 0 && <span className="sr-only" role="status">
      {conversation.length} messages in the Tree conversation
    </span>}
  </div>;
}
