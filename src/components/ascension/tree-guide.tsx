import { useEffect, useRef, useState } from "react";
import { TreePine } from "lucide-react";

/** The same spoken Tree stays available with the selected pathway and in reality inspection.
 * The server answers from selected design context; it cannot claim a physical test.
 */
type GuidePart = { name: string; purpose: string; location: string };
export type GuidePathway = {
  title: string;
  summary: string;
  steps: string[];
  parts: GuidePart[];
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

export function TreeGuide({ objective, pathway, enabled, onSpeak, compact = false }: {
  objective: string;
  pathway: GuidePathway;
  enabled: boolean;
  onSpeak: (answer: string) => void;
  compact?: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const microphone = useRef<VoiceRecognizer | null>(null);
  useEffect(() => () => { pending.current?.abort(); microphone.current?.stop(); }, []);
  useEffect(() => {
    pending.current?.abort();
    setAnswer("");
    setError("");
    setQuestion("");
    setThinking(false);
  }, [pathway.title, objective]);

  async function ask(value: string) {
    const text = value.trim();
    if (!text || thinking || text.length > 800) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setQuestion(text);
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
          pathway: {
            title: pathway.title,
            summary: pathway.summary,
            steps: pathway.steps.slice(0, 8),
            parts: pathway.parts.slice(0, 12),
          },
        }),
      });
      const data: { answer?: string; error?: string } = await response.json();
      if (!response.ok || !data.answer?.trim())
        throw new Error(data.error || "The Tree could not complete that explanation.");
      if (!controller.signal.aborted) {
        const reply = data.answer.trim();
        setAnswer(reply);
        if (enabled) onSpeak(reply);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The Tree could not answer.");
    } finally {
      if (!controller.signal.aborted) setThinking(false);
    }
  }

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
      <p className="mt-2 text-xs text-sky-100/80">Ask about this pathway, one of its parts, or a connection worth exploring.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input type="text" aria-label="Ask the Tree" value={question} maxLength={800}
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") void ask(question); }}
          placeholder="Ask the Tree about this design"
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
      {answer && <p className="mt-3 whitespace-pre-wrap leading-6 text-sky-100" aria-live="polite">{answer}</p>}
    </>}
  </div>;
}
