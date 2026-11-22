import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1366,height:850}});
  await page.goto("http://127.0.0.1:4178/tests/fixtures/active-tree-inspection.html");
  await page.getByRole("button",{name:"Select saved real pathway"}).waitFor();
  assert.equal(await page.getByRole("complementary",
    {name:"Component labels for the selected pathway"}).count(),0,
    "The opening Tree must have NO component writing or labels");
  assert.equal(await page.locator(".ascension-crystal-reality").count(),0,
    "The opening Tree must not show a preview or fabricated design");
  await page.getByRole("button",{name:"Select saved real pathway"}).click();
  const labels=page.getByRole("complementary",
    {name:"Component labels for the selected pathway"});
  await labels.waitFor();
  assert.deepEqual(await labels.locator("button").allTextContents(),[
    "Shared memory dock","Guidance drone",
  ],"Only actual recorded pathway components may be listed");
  assert.equal(await page.locator(".ascension-component-details").count(),0,
    "Before selection there must be no fabricated details");
  const viewport=await page.locator(".ascension-crystal-design-view").boundingBox();
  const aside=await labels.boundingBox();
  assert.ok(viewport && aside && viewport.x + viewport.width <= aside.x + 3,
    "Owner-approved component labels must be BESIDE—not on top of—the image");
  await labels.getByRole("button",{name:"Shared memory dock"}).click();
  await labels.getByText("Unifies the two recorded drone memories").waitFor();
  assert.deepEqual(await labels.locator("dt").allTextContents(),["What","Where","Does"]);
  const expectedSpoken = "What: Shared memory dock. Where: Inside recorded dock housing. Does: Unifies the two recorded drone memories";
  await page.waitForFunction(expected =>
    document.querySelector("#speech-fixture")?.textContent === expected, expectedSpoken);
  await labels.getByRole("button",{name:"Guidance drone"}).click();
  await labels.getByText("Gives guidance using the real recorded pathway").waitFor();
  assert.equal(await labels.getByRole("button",{name:"Guidance drone"}).getAttribute("aria-pressed"),"true");
  await page.getByRole("button",{name:"Switch to Dissect"}).click();
  await page.getByText(/This view needs the matching 3D model/).waitFor();
  assert.equal(await labels.count(),1,"Side list must persist while changing inspection views");
  await page.getByRole("button",{name:"Test unavailable media"}).click();
  await page.waitForFunction(()=>
    !document.querySelector(".ascension-crystal-reality"));
  assert.equal(await labels.count(),0,
    "Do not pretend the selected design has viewable media if no real asset exists");
  console.log("PASS: active V1 Tree has no front labels; selected real image and separate What/Where/Does side list with spoken callback, persistent across Dissect, and no invented 3D.");
} finally { await browser.close(); }
