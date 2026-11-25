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
// Exercise the real runtime with a neutral acceptance fixture, never an
// owner's invention or unpublished project description.
const objective = "Design a modular tabletop cable organizer with removable dividers.";
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
  await page.waitForFunction(() => {
    const img = document.querySelector(".ascension-approved-scene img");
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 20000 });
  const art = await approved.evaluate(img => ({
    loaded: img.complete && img.naturalWidth > 0,
    source: new URL(img.src).pathname,
    fit: getComputedStyle(img).objectFit,
  }));
  if (!art.loaded || art.source !== "/approved-scene/ascension-exact-approved-scene.png" ||
      art.fit !== "contain")
    throw Error("The original approved Tree/Groundskeeper/Book composition is missing or altered");
  const guideSaidWelcome = await page.evaluate(() =>
    window.__ascensionSpoken.some(words => /^Welcome to ASCENSION\./.test(words)));
  if (!guideSaidWelcome) throw Error("The groundskeeper did not speak her opening welcome");
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

  // A verified run should present the ONE actual evolving result itself,
  // never demand a model/pathway selection or create a second local crystal.
  await page.waitForFunction(() => {
    const messages = window.__ascensionSpoken || [];
    const answer = [...document.querySelectorAll("span.sr-only[role='status']")]
      .map(el => (el.textContent || "").trim())
      .find(t => t.length > 40 &&
        !/Your device is saving|authorized governed ASCENSION engine is processing/i.test(t));
    return Boolean(answer && messages.some(text => text.includes(answer.slice(0,60))));
  }, null, { timeout: 15000 });
  const spoken = await page.evaluate(() => window.__ascensionSpoken);
  if (spoken.some(text => /tell me which pathway to enter|choose (claude|grok|openai|blend)/i.test(text)))
    throw Error("Obsolete provider chooser interrupted the owner's one evolving result");
  if (await page.locator(".ascension-crystal-error").count())
    throw Error("The governed result could not be revealed");
  if (await page.locator(".ascension-tree-crystal[data-active='true']").count() !== 1)
    throw Error("A genuine governed result must remain on its original selected crystal");

  // No unapproved front overlay, and do not fake a GLB/blueprint from text.
  if (await page.locator(".living-tree, .designed-screen, .living-pathway-options").count())
    throw Error("An obsolete Tree/overlay replaced the active approved V1");
  if (!await page.locator(".ascension-approved-scene img").count())
    throw Error("The groundskeeper vanished after entering the result");
  const realMedia = await page.locator(".ascension-crystal-reality").count();
  if (!realMedia) throw Error("The governed result did not deliver any actual design media; full V1 cannot pass");
  // The completed V1 specifically requires a REAL returned 3D model for
  // Dissect / Explode / Implode. A picture or wireframe placeholder must fail.
  for (const [instruction, mode] of [
    ["show me inside", "dissect"],
    ["take it apart", "exploded"],
    ["put it together", "imploded"],
  ]) {
    await command(instruction);
    await page.locator(".v1-model-canvas canvas").waitFor({ timeout: 30000 });
    await page.locator(".v1-model-measurement").waitFor({ timeout: 30000 });
    if (await page.locator(".v1-design-model [role='status']").count())
      throw Error("Real " + mode + " inspection reported a model error");
  }
  // Owner-approved labels must be outside the picture, and reference actual
  // component What / Where / Does rather than invented geometry names.
  const componentPanel = page.getByRole("complementary", {
    name: "Component labels for the selected pathway",
  });
  await componentPanel.waitFor({ timeout: 10000 });
  const firstPart = componentPanel.getByRole("button").first();
  await firstPart.click();
  for (const field of ["What", "Where", "Does"]) {
    await componentPanel.locator("dt", { hasText: field }).waitFor();
  }
  await command("show the blueprint");
  const blueprint = page.getByAltText("Delivered pathway blueprint");
  await blueprint.waitFor({ timeout: 15000 });
  console.log("ASCENSION_LIVE_GOVERNED_OWNER_V1_VERIFIED genuine_model_views_and_blueprint=true");
} catch (error) {
  const details = await page.locator(".ascension-crystal-error").allTextContents().catch(() => []);
  console.error("ASCENSION_LIVE_GOVERNED_OWNER_V1_FAILED",
    error instanceof Error ? error.message : String(error), details.join(" | "));
  throw error;
} finally {
  try { await page.screenshot({ path: "ascension-v1-live-engage.png", fullPage: true }); } catch {}
  await browser.close();
}
