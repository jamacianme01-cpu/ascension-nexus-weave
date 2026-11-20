/**
 * The Tree of Knowledge has a woman voice. Never silently fall back
 * to the browser's default (often a male voice).
 * The browser supplies installed voices: no paid/cloud provider is added here.
 */
export type TreeVoiceCandidate = Pick<SpeechSynthesisVoice, "name" | "lang" | "voiceURI" | "localService">;

const WOMAN_NAMES = /(?:^|[^a-z])(?:samantha|jenny|aria|zira|serena|victoria|susan|kate|ava|emma|amy|salli|joanna|kendra|ivy|kimberly|sonia|libby|natasha|hazel|sarah|sara|olivia|priya|heera|allison|moira|tessa|fiona|female|woman)(?:$|[^a-z])/i;
const MALE_NAMES = /(?:^|[^a-z])(?:david|mark|guy|ryan|brian|daniel|george|james|fred|male)(?:$|[^a-z])/i;

export function selectTreeWomanVoice<T extends TreeVoiceCandidate>(voices: readonly T[]): T | null {
  const english = voices.filter(voice => /^en(?:-|_)/i.test(voice.lang) || voice.lang.toLowerCase() === "en");
  const women = english.filter(voice => WOMAN_NAMES.test(voice.name) && !MALE_NAMES.test(voice.name));
  // An old robotic desktop woman voice is not the natural woman voice the
  // owner approved. There is no robotic or male substitute at any point.
  const natural = women.filter(voice =>
    /neural|natural|premium|enhanced|online|samantha|ava/i.test(voice.name) &&
    !/desktop|compact|legacy|standard/i.test(voice.name));
  if (!natural.length) return null;

  const rating = (voice: T): number => {
    const name = voice.name.toLowerCase();
    let score = 0;
    if (/neural|natural|premium|enhanced|online/.test(name)) score += 100;
    if (/jenny|aria|ava|sonia|samantha|salli|joanna/.test(name)) score += 30;
    if (/google.*female|microsoft/.test(name)) score += 12;
    if (voice.localService === false) score += 8;
    if (/en[-_]us/i.test(voice.lang)) score += 5;
    if (/desktop|compact/.test(name)) score -= 10;
    return score;
  };
  return natural.slice().sort((a, b) => rating(b) - rating(a))[0] ?? null;
}

/** Browser speech voices frequently load AFTER page mount / first getVoices(). */
export async function awaitTreeWomanVoice(
  synth: Pick<SpeechSynthesis, "getVoices" | "addEventListener" | "removeEventListener">,
  timeoutMs = 2200,
): Promise<SpeechSynthesisVoice | null> {
  const immediate = selectTreeWomanVoice(synth.getVoices());
  if (immediate) return immediate;
  return new Promise(resolve => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = (voice: SpeechSynthesisVoice | null) => {
      if (finished) return;
      finished = true;
      synth.removeEventListener("voiceschanged", updated);
      if (timer) clearTimeout(timer);
      resolve(voice);
    };
    const updated = () => {
      const chosen = selectTreeWomanVoice(synth.getVoices());
      if (chosen) settle(chosen);
    };
    synth.addEventListener("voiceschanged", updated);
    updated();
    if (!finished) timer = setTimeout(() => settle(selectTreeWomanVoice(synth.getVoices())), timeoutMs);
  });
}
