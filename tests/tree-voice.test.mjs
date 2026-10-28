import assert from "node:assert/strict";
import { createTreeVoice } from "../src/lib/ascension/tree-voice.mjs";
let lastRecognition;
class Recognition {
  constructor() { lastRecognition = this; }
  start() { this.started = true; }
  abort() { this.aborted = true; }
}
class Utterance { constructor(text) { this.text = text; } }
const spoken = [], transcripts = [], states = [], errors = [];
let cancelled = 0;
const voice = createTreeVoice({
  speech: { speak: message => spoken.push(message), cancel: () => cancelled++ },
  Utterance, Recognition,
  onTranscript: text => transcripts.push(text),
  onState: state => states.push(state), onError: error => errors.push(error),
});
assert.equal(spoken.length, 0, "No autoplay on creation");
voice.speak("What do you want to accomplish?");
assert.equal(states.at(-1), "speaking");
assert.equal(spoken[0].text, "What do you want to accomplish?");
voice.listen();
assert.equal(cancelled, 1, "Listening interrupts speech to avoid feedback");
assert.equal(states.at(-1), "listening");
const oldResult = lastRecognition.onresult;
const result = [{ transcript: "Build a wind turbine" }]; result.isFinal = true;
lastRecognition.onresult({ results: [result] });
assert.deepEqual(transcripts, ["Build a wind turbine"]);
assert.equal(states.at(-1), "idle");
oldResult({ results: [result] });
assert.equal(transcripts.length, 1, "Stale recognition cannot duplicate a message");
voice.listen();
const denied = lastRecognition;
denied.onerror({ error: "not-allowed" });
assert.match(errors.at(-1), /denied/);
assert.equal(denied.aborted, true);
voice.speak("First");
const staleEnd = spoken.at(-1).onend;
voice.speak("Second");
staleEnd();
assert.equal(states.at(-1), "speaking", "Old utterance cannot end new speech");
voice.stop();
assert.equal(states.at(-1), "idle");
voice.listen();
const pending = lastRecognition.onresult;
voice.dispose();
pending({ results: [result] });
assert.equal(transcripts.length, 1, "Disposed Tree cannot receive audio results");
assert.equal(voice.speak("after disposal"), false);
assert.equal(voice.listen(), false);
const unavailableErrors = [];
const unavailable = createTreeVoice({ onTranscript() {}, onError: text => unavailableErrors.push(text) });
assert.equal(unavailable.listen(), false);
assert.equal(unavailable.speak("Hello"), false);
assert.equal(unavailableErrors.length, 2);
unavailable.dispose();
console.log("Tree voice behavioral checks passed: autoplay, interruption, dictation, stale events, denial, stop, cleanup, unavailable browser.");
