#!/usr/bin/env node
/**
 * Test the REAL active / route, not a separate TreeVoiceSurface or CrystalSurface
 * fixture. No server objective is submitted, no private invention is uploaded,
 * and no synthetic result is created. Failure blocks the repair PR.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.addInitScript(() => {
    window.__ascensionSpoken = [];
    window.__micStarts = 0;
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        constructor(text) { this.text = text; this.onstart = null; this.onend = null; }
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices() { return [{ lang: "en-US", localService: true, name: "Ava" }]; },
        speak(utterance) {
          window.__ascensionSpoken.push(utterance.text);
          queueMicrotask(() => { utterance.onstart?.(); utterance.onend?.(); });
        },
        cancel() {}, addEventListener() {}, removeEventListener() {},
      },
    });
    window.SpeechRecognition = class {
      constructor() { this.processLocally = true; window.__activeRecognition = this; }
      start() { window.__micStarts++; }
      stop() { this.onend?.(); }
    };
  });

  const address = "http://127.0.0.1:4179/";
  await page.goto(address, { waitUntil: "domcontentloaded", timeout: 60000 });
  const book = page.locator(".ascension-library-book img");
  await book.waitFor({ timeout: 30000 });
  const bookDetails = await book.evaluate(img => ({
    ready: img.complete && img.naturalWidth > 0,
    source: new URL(img.src).pathname,
    fit: getComputedStyle(img).objectFit,
  }));
  assert.equal(bookDetails.ready, true, "The original Book must load on the ACTUAL route");
  assert.equal(bookDetails.source, "/approved-scene/01-closed-book.jpg");
  assert.equal(bookDetails.fit, "contain", "Do not crop the approved Book");

  await page.getByRole("button", { name: "Enter ASCENSION using the Library Card" }).click();
  const artwork = page.locator(".ascension-approved-scene img");
  await artwork.waitFor({ timeout: 30000 });
  const artworkDetails = await artwork.evaluate(img => ({
    ready: img.complete && img.naturalWidth > 0,
    source: new URL(img.src).pathname,
    fit: getComputedStyle(img).objectFit,
  }));
  assert.deepEqual(artworkDetails, {
    ready: true,
    source: "/approved-scene/ascension-exact-approved-scene.png",
    fit: "contain",
  }, "Do not replace, crop or lose the owner-approved Groundskeeper/Tree composition");

  await page.waitForFunction(() =>
    window.__ascensionSpoken.some(text => /^Welcome to ASCENSION\./.test(text)),
  null, { timeout: 10000 });
  assert.equal(await page.locator(".ascension-crystal-reality").count(), 0,
    "No invented design or preview belongs on the opening Tree");
  assert.equal(await page.getByRole("complementary",
    { name: "Component labels for the selected pathway" }).count(), 0,
    "Component labels belong beside an actual selected design, never the opening Tree");
  assert.equal(await page.getByText(/Tell me which pathway to enter\./).count(), 0,
    "Do not restore an obsolete pathway-choice instruction");

  // The spoken welcome may already start the local microphone. Verify both
  // supported states without toggling an active microphone off.
  const mic = page.locator(".ascension-voice-anchor > button");
  const micLabel = await mic.getAttribute("aria-label");
  if (micLabel === "Speak with groundskeeper") await mic.click();
  else assert.equal(micLabel, "Stop microphone");
  await page.waitForFunction(() => window.__micStarts > 0, null, { timeout: 10000 });
  async function spokenCommand(words) {
    await page.waitForFunction(() => document.querySelector('.ascension-voice-anchor > button')?.getAttribute('aria-pressed') === 'true', null, { timeout: 15000 });
    await page.evaluate(transcript => {
      const active = window.__activeRecognition;
      active.onresult({ results: [[{ transcript }]] });
      // A recognition provider can deliver a late duplicate event after stop.
      // It must not create another intent or interrupt the new voice session.
      active.onresult({ results: [[{ transcript }]] });
    }, words);
  }
  await spokenCommand("what has grown");
  await page.waitForFunction(() =>
    window.__ascensionSpoken.some(text => text.includes(
      "Tell me which intent crystal you would like me to retrieve."
    )), null, { timeout: 10000 });
  assert.equal(await page.locator(".ascension-crystal-reality").count(), 0,
    "A voice question with no recorded result must not fabricate one");
  // Exercise the real local-first creation flow on the ACTUAL route.
  // No backend is mocked as successful and no invented result is accepted.
  const neutralIntent = "Design a modular tabletop organizer with two compartments.";
  const transmitted = [];
  page.on("request", request => {
    if (request.method() !== "POST" ||
        new URL(request.url()).origin !== new URL(address).origin) return;
    const body = request.postData() || "";
    if (body.includes(neutralIntent) || body.includes("folding cable tray")) {
      transmitted.push({url: request.url(), body});
    }
  });
  await spokenCommand(neutralIntent);
  await page.locator(".ascension-tree-crystal[data-active='true']").waitFor({ timeout: 15000 });
  assert.equal(await page.locator(".ascension-tree-crystal").count(), 1,
    "A duplicate microphone event must not save a second intent crystal");
  assert.equal(transmitted.filter(request => request.body.includes(neutralIntent)).length, 0,
    "A plain owner intent must never leak to the governed web server");
  assert.equal(await page.locator(".ascension-crystal-reality").count(), 0,
    "Saving an intent is not a completed design");

  // Reuse the same voice-only interaction to make a deliberate, explicit
  // owner-authorized governed submission. The existing backend may be
  // unconfigured in CI, but the actual submission must be attempted once.
  await spokenCommand("new intent");
  // Real speech recognizers may omit a comma after the ENGAGE command.
  const spokenAuthorized = "Engage ASCENSION design a folding cable tray.";
  const submission = page.waitForEvent("request", {
    predicate: request => request.method() === "POST" &&
      new URL(request.url()).origin === new URL(address).origin &&
      (request.postData() || "").includes("design a folding cable tray."),
    timeout: 30000,
  });
  await spokenCommand(spokenAuthorized);
  await submission;
  assert.equal(transmitted.filter(request =>
    request.body.includes("design a folding cable tray.")).length, 1,
    "The explicit spoken authorized intent must produce exactly one governed submission");
  assert.equal(await page.locator(".ascension-crystal-reality").count(), 0,
    "A server submission is not proof of a delivered design");
  assert.deepEqual(errors, [], "The REAL active Book/Tree route must not crash");

  console.log("PASS: real / route loads original Book and Tree, spoken welcome and active voice control; no fabricated result or old chooser.");
} finally {
  await browser.close();
}
