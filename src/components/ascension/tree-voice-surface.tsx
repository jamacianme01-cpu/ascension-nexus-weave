import { useEffect, useRef, useState, type ReactNode } from "react";
import { createTreeVoice, type TreeRecognition, type TreeVoiceController, type TreeVoiceState } from "@/lib/ascension/tree-voice.mjs";

type TextField = HTMLInputElement | HTMLTextAreaElement;
function editableField(value: EventTarget | null): value is TextField {
  return (value instanceof HTMLTextAreaElement ||
    (value instanceof HTMLInputElement && ["text", "search"].includes(value.type))) &&
    !value.disabled && !value.readOnly;
}

/** Additive voice accessibility. Does not generate answers or claim engine evaluation. */
export function TreeVoiceSurface({ children }: { children: ReactNode }) {
  const surface = useRef<HTMLDivElement>(null);
  const field = useRef<TextField | null>(null);
  const voice = useRef<TreeVoiceController | null>(null);
  const [state, setState] = useState<TreeVoiceState>("idle");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [hasField, setHasField] = useState(false);
  useEffect(() => {
    const browser = window as Window & {
      SpeechRecognition?: new () => TreeRecognition;
      webkitSpeechRecognition?: new () => TreeRecognition;
    };
    const controller = createTreeVoice({
      speech: window.speechSynthesis,
      Utterance: window.SpeechSynthesisUtterance,
      Recognition: browser.SpeechRecognition ?? browser.webkitSpeechRecognition,
      onTranscript: text => { setDraft(text); setNotice("Review your words before inserting them. Nothing has been submitted."); },
      onState: setState,
      onError: setNotice,
    });
    voice.current = controller;
    setReady(true);
    const select = () => {
      const selection = window.getSelection();
      if (selection?.anchorNode && surface.current?.contains(selection.anchorNode)) {
        setSelected(selection.toString().trim().slice(0, 2400));
      }
    };
    const hidden = () => { if (document.hidden) controller.stop(); };
    document.addEventListener("selectionchange", select);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("selectionchange", select);
      document.removeEventListener("visibilitychange", hidden);
      controller.dispose();
      voice.current = null;
    };
  }, []);
  function insert() {
    const target = field.current;
    if (!target || !surface.current?.contains(target) || !editableField(target)) {
      setHasField(false);
      setNotice("First select an editable text field in your Book, then return here.");
      return;
    }
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const value = target.value.slice(0, start) + draft + target.value.slice(end);
    if (target.maxLength >= 0 && value.length > target.maxLength) {
      setNotice("These words exceed the selected field's limit. Shorten them before inserting.");
      return;
    }
    const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) { setNotice("This field could not be updated. Your words remain available to copy."); return; }
    setter.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.focus();
    target.setSelectionRange(start + draft.length, start + draft.length);
    setDraft("");
    setNotice("Inserted into the Book. Review it there and choose ENGAGE yourself when ready.");
  }
  return <>
    <div ref={surface} className="contents" onFocusCapture={event => {
      if (editableField(event.target)) { field.current = event.target; setHasField(true); }
    }}>{children}</div>
    <details className="fixed bottom-4 right-4 z-50 max-w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-gold/40 bg-background/95 p-3 text-foreground shadow-xl"
      onToggle={event => { if (!event.currentTarget.open) voice.current?.stop(); }}>
      <summary className="min-h-11 cursor-pointer py-2 text-sm text-gold">TREE VOICE</summary>
      <div className="space-y-3 pt-2" aria-label="Tree voice controls">
        <p className="text-xs text-muted-foreground">Select Book text to hear it, or select a Book text field before dictating. Voice input may be processed by your browser's speech provider.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!ready} className="min-h-11 rounded border border-gold/40 px-3 disabled:opacity-40"
            onClick={() => { setNotice(""); voice.current?.speak("Welcome to ASCENSION. What do you want to accomplish?"); }}>Welcome</button>
          <button type="button" disabled={!ready || state === "listening"} className="min-h-11 rounded border border-gold/40 px-3 disabled:opacity-40"
            onClick={() => { setNotice(""); voice.current?.listen(); }}>Speak</button>
          <button type="button" disabled={!ready || !selected} className="min-h-11 rounded border border-gold/40 px-3 disabled:opacity-40"
            onClick={() => { setNotice(""); voice.current?.speak(selected); }}>Read selected text</button>
          <button type="button" className="min-h-11 rounded border border-gold/40 px-3" onClick={() => voice.current?.stop()}>Stop</button>
        </div>
        <p role="status" aria-live="polite" className="text-xs">{state === "listening" ? "Listening…" : state === "speaking" ? "Speaking…" : "Ready"}</p>
        <label className="block text-sm">Review your words
          <textarea value={draft} maxLength={4000} onChange={event => setDraft(event.target.value)} rows={3}
            className="mt-1 w-full rounded border border-gold/30 bg-background p-2" />
        </label>
        <button type="button" disabled={!draft.trim() || !hasField} onClick={insert}
          className="min-h-11 rounded border border-gold/40 px-3 disabled:opacity-40">Insert into selected Book field</button>
        {notice && <p role="status" className="text-xs text-gold">{notice}</p>}
        <p className="text-xs text-muted-foreground">Voice input and read-aloud only. Answers and evaluation still come from your existing ASCENSION flow.</p>
      </div>
    </details>
  </>;
}
