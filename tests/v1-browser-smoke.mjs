import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const messages = [];
  page.on("pageerror", error => messages.push(error.message));
  await page.addInitScript(() => {
    window.__treeSpoken = [];
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel() {}, speak(utterance) {
        window.__treeSpoken.push(utterance.text);
        queueMicrotask(() => { utterance.onstart?.(); utterance.onend?.(); });
      }},
    });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext("2d");
    const pixels = ctx.createImageData(96, 96);
    let seed = 1234567;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      pixels.data[i] = seed & 255;
      pixels.data[i + 1] = seed >>> 8 & 255;
      pixels.data[i + 2] = seed >>> 16 & 255;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  });
  assert.ok(png.length > 4000);
  const path = (id, title) => ({
    id, title,
    summary: "A concrete worker drone design with rotor lift, electric power, sensing and a carrying gripper for light indoor material handling.",
    steps: ["Frame and mount four rotors on the body.", "Power the motors using a protected onboard battery.", "Use optical sensing and a gripper to transfer a small item."],
    tradeoffs: ["Limited battery endurance and payload capacity."],
    parts: [
      { name: "Rotor assembly", purpose: "Provides lift and steering.", location: "Four arm tips." },
      { name: "Battery", purpose: "Stores and supplies power.", location: "Central frame." },
      { name: "Gripper", purpose: "Holds a small item.", location: "Under the central frame." },
    ],
  });
  const calls = [];
  await page.route("**/api/public/ascension/independent", async route => {
    const request = route.request();
    const phase = request.method() === "GET" ? "capabilities" : request.postDataJSON()?.phase;
    calls.push(phase);
    let body;
    if (phase === "capabilities") body = { picture_generation_enabled: true, providers: {OpenAI:true,Claude:false,Grok:false} };
    else if (phase === "initial") body = { phase: "initial", answer: "A useful private engineering architecture for a four-rotor material-handling worker drone, with battery, motor controllers, sensors, lightweight frame and a gripper." };
    else if (phase === "pathways") body = {
      introduction: "Here are four engineered directions.",
      pathways: [path("p1", "Mobility-first architecture"), path("p2", "Coordinated team architecture"), path("p3", "Modular platform architecture")],
      blend: {...path("blend", "Adaptive modular team"), blend_reason: "Combines the mobility, team coordination, and modular platform approaches."},
      verified: false, contributors: ["OpenAI"], unavailable: ["Claude","Grok"], providerErrors: [], mode: "openai-only-provisional", governance: "not verified", persistence: "not persisted",
    };
    else if (phase === "picture") body = { image_url: png, verified: false };
    else if (phase === "guide") body = {phase:"guide",answer:"The rotor assembly provides lift. Its battery is centered to distribute weight, while the gripper hangs below the frame."};
    else body = { error: "Unexpected test API request" };
    await route.fulfill({ status: body.error ? 503 : 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const pageResponse = await page.goto("http://127.0.0.1:4174/", { waitUntil: "domcontentloaded" });
  assert.equal(pageResponse?.status(), 200, "The app's entry URL did not return successfully.");
  await page.locator('img[src="/approved-scene/ascension-tree-behind-book-hq.jpg"]').waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => window.__treeSpoken?.some(x => x.includes("Welcome to ASCENSION")), { timeout: 10000 });
  await page.locator("#objective").fill("make worker drones");
  await page.getByRole("button", { name: "ENGAGE ASCENSION" }).click();
  await page.getByRole("tab").first().waitFor();
  assert.equal(await page.getByRole("tab").count(), 4);
  for (const title of ["Mobility-first architecture", "Coordinated team architecture", "Modular platform architecture", "Adaptive modular team"]) {
    assert.equal(await page.getByRole("tab", {name: new RegExp(title)}).count(),1, "The actual pathway title must remain visible: " + title);
  }
  assert.equal(calls.filter(x => x === "picture").length, 0, "No pictures before selection");
  assert.equal(await page.getByText("INITIAL ANSWER").count(), 0);
  assert.ok(await page.locator('.ascension-world[data-realities="true"]').count());
  await page.getByRole("tab").first().click();
  await page.locator('img[alt^="Concept picture of"]').waitFor({ state: "visible" });
  assert.equal(calls.filter(x => x === "picture").length, 1);
  await page.getByRole("button", {name:"LABELS",exact:true}).click();
  await page.getByRole("button", {name:"Rotor assembly",exact:true}).click();
  assert.ok(await page.getByText("Four arm tips.").count());
  await page.getByRole("button", {name:/TREE OF KNOWLEDGE/}).click();
  await page.getByRole("textbox",{name:"Ask the Tree"}).fill("Where does the battery belong?");
  await page.getByRole("button",{name:"ASK",exact:true}).click();
  await page.getByText(/gripper hangs below/).waitFor({state:"visible"});
  await page.getByRole("button",{name:"BLUEPRINT",exact:true}).first().click();
  await page.locator("dialog.reality-screen[open]").waitFor({state:"visible"});
  assert.equal(await page.locator('dialog.reality-screen[data-v1="true"]').count(), 1);
  assert.equal(await page.getByRole("button", {name:"NEW ANSWERS",exact:true}).count(), 0);
  assert.equal(await page.getByRole("button", {name:"SOUND OFF",exact:true}).count(), 0);
  await page.getByRole("button", {name:/BACK TO PATHWAYS/}).click();
  assert.equal(await page.locator("dialog.reality-screen[open]").count(), 0);
  assert.equal(messages.length, 0, messages.join(" | "));
  console.log("PASS V1 browser: approved Tree and Book; speech welcome; objective; four pathways; image only on selection; labels and Tree guidance; blueprint opens; no unapproved V1 controls");
} finally {
  await browser.close();
}
