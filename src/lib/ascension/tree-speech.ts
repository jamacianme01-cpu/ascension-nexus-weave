/** Prefer an available named woman's voice; never simulate one by pitching a male voice. */
export function selectTreeVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const names = /\b(Aria|Jenny|Sonia|Ava|Emma|Michelle|Samantha|Zira|Susan|Hazel|Serena|Victoria|Karen|Moira|Tessa)\b|Google US English/i;
  const english = voices.filter(voice => /^en(?:-|_)/i.test(voice.lang));
  return english.filter(voice => names.test(voice.name))
    .sort((a, b) => score(b) - score(a))[0]
    ?? english.sort((a, b) => score(b) - score(a))[0]
    ?? null;
}
function score(voice: SpeechSynthesisVoice): number {
  return (/natural|neural|enhanced|premium/i.test(voice.name) ? 100 : 0) +
    (/Aria|Jenny|Ava|Samantha/i.test(voice.name) ? 20 : 0) + (/en-US/i.test(voice.lang) ? 10 : 0);
}
export async function availableTreeVoice(speech: SpeechSynthesis): Promise<SpeechSynthesisVoice | null> {
  const current = selectTreeVoice(speech.getVoices?.() ?? []);
  if (current) return current;
  return new Promise(resolve => {
    const done = () => {
      speech.removeEventListener?.("voiceschanged", changed);
      window.clearTimeout(timer);
      resolve(selectTreeVoice(speech.getVoices?.() ?? []));
    };
    const changed = () => { if (selectTreeVoice(speech.getVoices?.() ?? [])) done(); };
    const timer = window.setTimeout(done, 1500);
    speech.addEventListener?.("voiceschanged", changed);
  });
}
