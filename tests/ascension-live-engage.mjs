#!/usr/bin/env node
/**
 * Live owner V1 acceptance for the ACTUAL active / route: Library Card,
 * approved Tree/Groundskeeper composition, explicit owner-authorized governed
 * ENGAGE, real selected answer, and only delivered inspection media.
 *
 * NEVER use a synthetic model or response to pass this production test.
 * No secrets or actual owner inventions are printed in CI logs.
 */
import { pathToFileURL } from "node:url";
if (!process.env.PLAYWRIGHT_MODULE) throw Error("Missing Playwright location");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const website = process.env.ASCENSION_V1_WEBSITE || "http://127.0.0.1:4174/";
const objective = "I want to make worker drones for people with dementia.";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.ASCENSION_CHROME_BIN,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  // This test uses the EXISTING accessible input, not real microphones.
  // Capture on-device guide messages without cloud voice providers.
  Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
  Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  window.__ascensionSpoken = [];
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: class {
      constructor(text) { this.text = text; this.onstart = null; this.onend = null; this.onerror = null; }
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
});
const page = await context.newPage();
async function command(words) {
  const input = page.getByPlaceholder("Speak or type your intent");
  await input.fill(words);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}
try {
  await page.goto(website, { waitUntil: "domcontentloaded", timeout: 60000 });
  // The former live test targeted a DELETED category chooser and LivingTree.
  // Test the shipped Library Card -> same-page Tree instead.
  await page.getByRole("button", { name: "Enter ASCENSION using the Library Card" })
    .click();
  const approved = page.locator(".ascension-approved-scene img");
  await approved.waitFor({ timeout: 20000 });
  const art = await approved.evaluate(img => ({
    loaded: img.complete && img.naturalWidth > 0,
    source: new URL(img.src).pathname,
    fit: getComputedStyle(img).objectFit,
  }));
  if (!art.loaded || art.source !== "/approved-scene/ascension-exact-approved-scene.png" ||
      art.fit !== "contain")
    throw Error("The original approved Tree/Groundskeeper/Book composition is missing or altered");
  await page.getByRole("button", { name: "Speak with groundskeeper" }).click();
  await page.getByPlaceholder("Speak or type your intent").waitFor({ timeout: 15000 });
  await command(objective);
  await page.locator(".ascension-tree-crystal[data-active='true']").waitFor({ timeout: 25000 });
  // Local saving does NOT authorize silently transmitting the owner objective.
  if (await page.locator("span.sr-only[role='status']").filter({
    hasText: "The authorized governed ASCENSION engine is processing",
  }).count()) throw Error("Saving a private crystal silently started remote engines");

  // The owner now explicitly authorizes the unchanged selected original.
  await command("engage ascension");
  const busy = page.locator("span.sr-only[role='status']").filter({
    hasText: "The authorized governed ASCENSION engine is processing",
  });
  await busy.waitFor({ state: "attached", timeout: 25000 });
  await busy.waitFor({ state: "detached", timeout: 240000 });
  const error = await page.locator(".ascension-crystal-error").allTextContents();
  if (error.length) throw Error("Actual governed submission failed: " + error.join(" | ").slice(0, 500));

  const utterances = await page.evaluate(() => window.__ascensionSpoken);
  const pathways = utterances.find(msg => /delivered \d+ recorded pathways:/i.test(msg));
  if (pathways && /delivered 4 recorded pathways:/i.test(pathways) &&
      !/\bBLEND\b/.test(pathways))
    throw Error("A genuine four-pathway result did not preserve BLEND");

  // The existing voice-first result can be a single delivered output or
  // multiple REAL engine choices. In either case, select only a real result.
  await command("enter first");
  const delivered = page.locator("span.sr-only[role='status']").filter({
    hasNotText: "The authorized governed ASCENSION engine is processing",
  });
  await page.waitForFunction(() => {
    const alerts = document.querySelector(".ascension-crystal-error");
    if (alerts) return true;
    return [...document.querySelectorAll("span.sr-only[role='status']")]
      .some(el => !!el.textContent?.trim() &&
        !/Your device is saving|authorized governed ASCENSION engine is processing/i.test(el.textContent));
  }, null, { timeout: 10000 });
  const lastError = await page.locator(".ascension-crystal-error").allTextContents();
  if (lastError.length) throw Error("The returned pathway could not be selected: " + lastError.join(" | "));
  const answerText = await delivered.allTextContents();
  if (!answerText.some(t => t.trim() &&
      !/Your device is saving|authorized governed ASCENSION engine is processing/i.test(t)))
    throw Error("No genuine governed answer was made available to the selected crystal");

  // No unapproved front overlay, and do not fake a GLB/blueprint from text.
  if (await page.locator(".living-tree, .designed-screen, .living-pathway-options").count())
    throw Error("An obsolete Tree/overlay replaced the active approved V1");
  if (!await page.locator(".ascension-approved-scene img").count())
    throw Error("The groundskeeper vanished after entering the result");
  const realMedia = await page.locator(".ascension-crystal-reality").count();
  const model = await page.locator(".ascension-crystal-reality canvas").count();
  console.log("ASCENSION_LIVE_GOVERNED_OWNER_V1_VERIFIED media_present=" +
    Boolean(realMedia) + " model_canvas_present=" + Boolean(model));
} catch (error) {
  const details = await page.locator(".ascension-crystal-error").allTextContents().catch(() => []);
  console.error("ASCENSION_LIVE_GOVERNED_OWNER_V1_FAILED",
    error instanceof Error ? error.message : String(error), details.join(" | "));
  throw error;
} finally {
  try { await page.screenshot({ path: "ascension-v1-live-engage.png", fullPage: true }); } catch {}
  await browser.close();
}
