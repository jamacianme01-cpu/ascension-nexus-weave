import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizedVoiceCommand, isContinuationPrompt, isDesignEditInstruction, isCancelContinuation,
} from "../src/lib/ascension/voice-intent-flow.mjs";

const prompts = [
  "build on result", "build on this intent", "build on the design",
  "continue this intent", "Continue my design!", "keep developing this intent",
  "make changes to the result", "please build on this result.",
];
for (const command of prompts) {
  assert.equal(isContinuationPrompt(command), true, "Continuation prompt: " + command);
}
for (const instruction of [
  "add a supporting rail",
  "please remove the upper housing",
  "can you improve the docking mechanism",
  "i want to replace the joint",
  "I'd like to adjust the geometry",
  "modify the sensor housing",
  "resize the left panel",
]) {
  assert.equal(isDesignEditInstruction(instruction), true, "Change instruction: " + instruction);
}
for (const command of ["new intent", "show the blueprint", "recall my design", "zoom in"]) {
  assert.equal(isContinuationPrompt(command), false, "Not a continuation prompt: " + command);
  assert.equal(isDesignEditInstruction(command), false, "Not a change instruction: " + command);
}
for (const cancellation of ["cancel", "never mind", "stop", "keep it as it is"]) {
  assert.equal(isCancelContinuation(cancellation), true, "Cancel: " + cancellation);
}
assert.equal(normalizedVoiceCommand("  CHANGE the rail?!  "), "change the rail");
const scene = readFileSync("src/components/ascension/crystal-experience.tsx", "utf8");
const start = scene.indexOf("if (isContinuationPrompt(input))");
const pending = scene.indexOf("if (continuing.current)", start);
const send = scene.indexOf("void sendIntent(input);", pending);
assert(start !== -1 && pending > start && send > pending,
  "A continuation prompt must wait for the next actual owner-spoken instruction.");
const promptBlock = scene.slice(start,pending);
assert.doesNotMatch(promptBlock, /sendIntent\s*\(/,
  "A 'build on result' command must never be submitted as the actual change.");
assert.match(scene, /chosen\.current && isDesignEditInstruction\(input\)/,
  "Existing selected intent must remain the parent for direct spoken edits.");
const surface=readFileSync("src/components/ascension/crystal-surface.tsx","utf8");
assert.match(surface, /working \|\| selectedId \|\| design/,
  "Selected intent crystal must remain visible even before model inference succeeds.");
assert.match(scene,/ascension-exact-approved-scene\.png/,
  "The exact approved Tree/Book image must not be replaced.");
console.log("PASS: approved voice-first BUILD ON RESULT waits for real change and saved crystal remains visible.");
