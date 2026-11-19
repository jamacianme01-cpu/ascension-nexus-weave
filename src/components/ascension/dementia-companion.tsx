import { useEffect, useState } from "react";

import { Panel } from "@/components/ascension/chrome";
import {
  acknowledge,
  cleanPhone,
  cleanPlace,
  dayKey,
  dueReminder,
  IDLE_PROMPT,
  readSafety,
  type DayAcknowledgments,
  type SafetyReading,
} from "@/lib/ascension/dementia-companion";

type CheckIn = { at: string; text: string; level: SafetyReading["level"] };

const EMPTY_ACK: DayAcknowledgments = { day: "", ids: [] };

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  const synth = window.speechSynthesis;
  try { synth.cancel(); } catch { return; }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.84;
  utterance.pitch = 0.96;
  try { synth.speak(utterance); } catch { /* This browser has no speech playback. */ }
}

function stopSpeech() {
  try { window.speechSynthesis?.cancel(); } catch { /* This browser has no speech playback. */ }
}

export function DementiaCompanion() {
  const [now, setNow] = useState(() => new Date());
  const [ack, setAck] = useState<DayAcknowledgments>(EMPTY_ACK);
  const [place, setPlace] = useState("");
  const [phone, setPhone] = useState("");
  const [voice, setVoice] = useState(false);
  const [note, setNote] = useState("");
  const [reading, setReading] = useState<SafetyReading | null>(null);
  const [log, setLog] = useState<CheckIn[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAck(loadJson("ascension.companion.ack", EMPTY_ACK));
    setPlace(cleanPlace(localStorage.getItem("ascension.companion.place") ?? ""));
    setPhone(cleanPhone(localStorage.getItem("ascension.companion.phone") ?? ""));
    setVoice(localStorage.getItem("ascension.companion.voice") === "on");
    setLog(loadJson("ascension.companion.log", []));
    setReady(true);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const prompt = dueReminder(now, ack, { place });
  const shown = reading ?? (prompt
    ? { level: "calm" as const, text: prompt.text, spoken: prompt.spoken, notifyCaregiver: prompt.id === "company" && Boolean(phone) }
    : { level: "calm" as const, text: IDLE_PROMPT.text, spoken: IDLE_PROMPT.spoken, notifyCaregiver: false });

  useEffect(() => () => stopSpeech(), []);
  useEffect(() => {
    if (!ready || !voice || reading) return;
    speak(shown.spoken);
  }, [ready, voice, reading, shown.spoken]);

  function remember(next: CheckIn) {
    const kept = [next, ...log].slice(0, 8);
    setLog(kept);
    localStorage.setItem("ascension.companion.log", JSON.stringify(kept));
  }

  function markDone() {
    if (!prompt) return;
    const next = acknowledge(ack, now, prompt.id);
    setAck(next);
    localStorage.setItem("ascension.companion.ack", JSON.stringify(next));
    setReading(null);
    remember({ at: now.toISOString(), text: "Acknowledged the reminder.", level: "calm" });
    stopSpeech();
  }

  function submit(message: string) {
    const result = readSafety(message);
    setReading(result);
    setNote("");
    remember({ at: new Date().toISOString(), text: result.text, level: result.level });
    if (voice) speak(result.spoken);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <Panel eyebrow="Companion" title="A quiet worker">
        <p className="text-2xl leading-snug text-foreground sm:text-3xl" role="status">{shown.text}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          This is a reminder and a calm voice. It is not medical care. It does not watch through a camera or a microphone. Check-ins stay on this device.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="min-h-12 rounded-md border border-gold/50 px-4 text-gold" onClick={() => speak(shown.spoken)}>
            Speak this
          </button>
          <button type="button" className="min-h-12 rounded-md border border-border px-4 text-muted-foreground" onClick={stopSpeech}>
            Stop
          </button>
          {prompt && (
            <button type="button" className="min-h-12 rounded-md bg-primary px-4 text-primary-foreground" onClick={markDone}>
              I did this
            </button>
          )}
        </div>
        {shown.notifyCaregiver && phone && (
          <a className="mt-4 inline-flex min-h-12 items-center rounded-md border border-primary/50 px-4 text-primary" href={`tel:${phone}`}>
            Call caregiver
          </a>
        )}
        {shown.level === "urgent" && (
          <p className="mt-4 text-base text-gold">Use the emergency number where you live if you are hurt or cannot get help.</p>
        )}
      </Panel>

      <Panel eyebrow="Check-in" title="How are you">
        <div className="flex flex-wrap gap-3">
          <button type="button" className="min-h-12 rounded-md border border-border px-4" onClick={() => submit("I am okay")}>I am okay</button>
          <button type="button" className="min-h-12 rounded-md border border-gold/50 px-4 text-gold" onClick={() => submit("I need help")}>I need a person</button>
          <button type="button" className="min-h-12 rounded-md border border-destructive/50 px-4 text-destructive" onClick={() => submit("I fell and I hurt")}>Something is wrong</button>
        </div>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); submit(note); }}>
          <label className="sr-only" htmlFor="companion-note">Tell me how you feel</label>
          <input
            id="companion-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Tell me how you feel"
            className="min-h-12 flex-1 rounded-md border border-border bg-void/40 px-3 text-base"
          />
          <button type="submit" className="min-h-12 rounded-md border border-gold/50 px-4 text-gold">Send</button>
        </form>
      </Panel>

      <Panel eyebrow="Caregiver" title="Only if you want">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-muted-foreground">
            Place name
            <input
              value={place}
              onChange={(event) => {
                const next = cleanPlace(event.target.value);
                setPlace(next);
                localStorage.setItem("ascension.companion.place", next);
              }}
              className="mt-1 min-h-12 w-full rounded-md border border-border bg-void/40 px-3 text-base text-foreground"
            />
          </label>
          <label className="text-sm text-muted-foreground">
            Caregiver phone
            <input
              value={phone}
              inputMode="tel"
              onChange={(event) => {
                const next = event.target.value.slice(0, 24);
                setPhone(next);
                localStorage.setItem("ascension.companion.phone", cleanPhone(next));
              }}
              className="mt-1 min-h-12 w-full rounded-md border border-border bg-void/40 px-3 text-base text-foreground"
            />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={voice}
            onChange={(event) => {
              setVoice(event.target.checked);
              localStorage.setItem("ascension.companion.voice", event.target.checked ? "on" : "off");
              if (!event.target.checked) stopSpeech();
            }}
          />
          Speak a reminder when it is due
        </label>
        <p className="mt-3 font-mono text-xs text-muted-foreground">Today {ready ? dayKey(now) : ""}</p>
      </Panel>

      {log.length > 0 && (
        <Panel eyebrow="On this device" title="Recent check-ins">
          <ul className="space-y-2 text-sm">
            {log.map((item) => (
              <li key={item.at} className="text-muted-foreground">
                <span className="text-foreground">{item.text}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
