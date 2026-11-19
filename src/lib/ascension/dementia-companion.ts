/**
 * Quiet companion for a person living with dementia.
 * One reminder at a time, on this device only.
 * Check-ins are what the person types or taps. There is no camera,
 * microphone capture, or location watch. This is not medical care.
 */

export type ReminderId = "morning" | "water" | "meal" | "rest" | "medicine" | "company";

export type SafetyLevel = "calm" | "caregiver" | "urgent";

export type CompanionPrompt = {
  id: ReminderId;
  text: string;
  spoken: string;
};

export type SafetyReading = {
  level: SafetyLevel;
  text: string;
  spoken: string;
  notifyCaregiver: boolean;
};

export type DayAcknowledgments = {
  day: string;
  ids: ReminderId[];
};

type ReminderWindow = {
  id: ReminderId;
  fromMinute: number;
  untilMinute: number;
  text: string;
  spoken: string;
};

const REMINDERS: ReminderWindow[] = [
  {
    id: "morning",
    fromMinute: 7 * 60,
    untilMinute: 10 * 60,
    text: "Good morning. You are safe here. Take the day slowly.",
    spoken: "Good morning. You are safe here. Take the day slowly.",
  },
  {
    id: "water",
    fromMinute: 10 * 60,
    untilMinute: 11 * 60 + 30,
    text: "A sip of water would be kind right now.",
    spoken: "A sip of water would be kind right now.",
  },
  {
    id: "meal",
    fromMinute: 11 * 60 + 30,
    untilMinute: 13 * 60 + 30,
    text: "It is time for a small meal, if you are hungry.",
    spoken: "It is time for a small meal, if you are hungry.",
  },
  {
    id: "rest",
    fromMinute: 13 * 60 + 30,
    untilMinute: 16 * 60,
    text: "You can rest. There is nothing you need to finish.",
    spoken: "You can rest. There is nothing you need to finish.",
  },
  {
    id: "medicine",
    fromMinute: 16 * 60,
    untilMinute: 18 * 60,
    text: "There is a reminder for the medicine your caregiver already set out. Take only that.",
    spoken: "There is a reminder for the medicine your caregiver already set out. Take only that.",
  },
  {
    id: "company",
    fromMinute: 18 * 60,
    untilMinute: 21 * 60,
    text: "Someone who cares for you can be reached if you want company.",
    spoken: "Someone who cares for you can be reached if you want company.",
  },
];

const URGENT = /\b(fall|fell|falling|hurt|hurts|pain|bleeding|bleed|chest|breath|breathe|choking|unconscious|emergency)\b/i;
const CAREGIVER = /\b(lost|scared|afraid|help|confused|panic|alone|where am i|don't know|do not know)\b/i;

export const IDLE_PROMPT = {
  text: "Nothing is due. You can sit and rest.",
  spoken: "Nothing is due. You can sit and rest.",
};

export function minuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function dayKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Quiet hours wrap past midnight when start is later than end. */
export function inQuietHours(minute: number, start = 21 * 60, end = 7 * 60): boolean {
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

export function cleanPlace(place: string): string {
  return place
    .replace(/[^\p{L}\p{N}\s'.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export function cleanPhone(phone: string): string {
  const trimmed = phone.trim().slice(0, 24);
  if (!/^[+0-9().\-\s]{7,24}$/.test(trimmed)) return "";
  return trimmed;
}

function withPlace(prompt: CompanionPrompt, place: string | undefined): CompanionPrompt {
  const named = cleanPlace(place ?? "");
  if (!named || (prompt.id !== "morning" && prompt.id !== "company")) return prompt;
  const where = prompt.id === "morning"
    ? `Good morning. You are at ${named}. Take the day slowly.`
    : `You are at ${named}. Someone who cares for you can be reached if you want company.`;
  return { ...prompt, text: where, spoken: where };
}

/**
 * The single reminder that may be shown now.
 * A reminder already acknowledged today stays quiet.
 * Quiet hours suppress every reminder.
 */
export function dueReminder(
  now: Date,
  acknowledged: DayAcknowledgments,
  options?: { quietStart?: number; quietEnd?: number; place?: string },
): CompanionPrompt | null {
  const minute = minuteOfDay(now);
  if (inQuietHours(minute, options?.quietStart ?? 21 * 60, options?.quietEnd ?? 7 * 60)) return null;
  const done = acknowledged.day === dayKey(now) ? new Set(acknowledged.ids) : new Set<ReminderId>();
  const due = REMINDERS
    .filter((item) => minute >= item.fromMinute && minute < item.untilMinute && !done.has(item.id))
    .sort((a, b) => b.fromMinute - a.fromMinute);
  const pick = due[0];
  if (!pick) return null;
  return withPlace({ id: pick.id, text: pick.text, spoken: pick.spoken }, options?.place);
}

export function acknowledge(acknowledged: DayAcknowledgments, now: Date, id: ReminderId): DayAcknowledgments {
  const day = dayKey(now);
  const ids = acknowledged.day === day ? acknowledged.ids : [];
  if (ids.includes(id)) return { day, ids };
  return { day, ids: [...ids, id] };
}

export function readSafety(message: string): SafetyReading {
  const text = message.replace(/\s+/g, " ").trim().slice(0, 280);
  if (!text) {
    return {
      level: "calm",
      text: "I am here. Nothing else is needed right now.",
      spoken: "I am here.",
      notifyCaregiver: false,
    };
  }
  if (URGENT.test(text)) {
    return {
      level: "urgent",
      text: "I hear you. Please get a person nearby, and use the emergency number where you live.",
      spoken: "I hear you. Please get a person nearby, and call for emergency help.",
      notifyCaregiver: true,
    };
  }
  if (CAREGIVER.test(text)) {
    return {
      level: "caregiver",
      text: "You are not in trouble. Stay where you are. A caregiver should come to you.",
      spoken: "You are not in trouble. Stay where you are. Someone who cares for you should come.",
      notifyCaregiver: true,
    };
  }
  return {
    level: "calm",
    text: "Thank you for telling me. You can sit and rest.",
    spoken: "Thank you. You can sit and rest.",
    notifyCaregiver: false,
  };
}
