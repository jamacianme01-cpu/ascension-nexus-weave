import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// The exact browser voice-selection TypeScript is executed in Node.
const source = readFileSync("src/lib/ascension/tree-woman-voice.ts", "utf8");
const output = ts.transpileModule(source, {compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
}}).outputText;
const { selectTreeWomanVoice, awaitTreeWomanVoice } = await import(
  "data:text/javascript;base64," + Buffer.from(output).toString("base64"));

const voice = (name, lang = "en-US", localService = true) => ({name, lang, voiceURI: name, localService});
const male = voice("Microsoft David Desktop");
const zira = voice("Microsoft Zira Desktop");
const jenny = voice("Microsoft Jenny Online (Natural)", "en-US", false);
const aria = voice("Microsoft Aria Neural", "en-US", false);
assert.equal(selectTreeWomanVoice([male, zira, aria]), aria);
assert.equal(selectTreeWomanVoice([male, zira, jenny]), jenny);
assert.equal(selectTreeWomanVoice([male]), null, "Never use male default.");
assert.equal(selectTreeWomanVoice([voice("Google US English")]), null, "Unknown gender must not be assumed.");
assert.equal(selectTreeWomanVoice([voice("Microsoft Zira Desktop", "de-DE")]), null);
assert.equal(selectTreeWomanVoice([zira]), zira);

const callbacks = new Set();
let activeVoices = [];
const synth = {
  getVoices() { return activeVoices; },
  addEventListener(event, callback) { assert.equal(event,"voiceschanged"); callbacks.add(callback); },
  removeEventListener(event, callback) { assert.equal(event,"voiceschanged"); callbacks.delete(callback); },
};
const pending = awaitTreeWomanVoice(synth, 300);
assert.equal(callbacks.size,1);
activeVoices = [male, jenny];
for (const callback of [...callbacks]) callback();
assert.equal(await pending, jenny, "Late voiceschanged must select natural woman voice.");
assert.equal(callbacks.size, 0, "Remove voice listener after selection.");
activeVoices=[male];
assert.equal(await awaitTreeWomanVoice(synth, 5), null, "Must not pick male voice after timeout.");
console.log("PASS: preferred natural woman voice, asynchronously loaded voices, no male/unknown fallback.");
