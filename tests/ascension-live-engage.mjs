#!/usr/bin/env node
/** Owner-approved one-page Tree acceptance; genuine governed result required. */
import { pathToFileURL } from "node:url";
if (!process.env.PLAYWRIGHT_MODULE) throw Error("Missing Playwright location");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const website = process.env.ASCENSION_V1_WEBSITE || "http://127.0.0.1:4174/";
const objective = "I want to make worker drones for people with dementia.";
const browser = await chromium.launch({headless:true,executablePath:process.env.ASCENSION_CHROME_BIN,args:["--no-sandbox"]});
const context = await browser.newContext({viewport:{width:1280,height:800}});
await context.addInitScript(() => {
  // No microphone required for the accessible text alternative.
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:undefined});
});
const page=await context.newPage();
try {
  await page.goto(website,{waitUntil:"domcontentloaded",timeout:60000});
  await page.getByRole("button",{name:"OPEN THE BOOK",exact:true}).waitFor({timeout:20000});
  await page.getByRole("button",{name:"OPEN THE BOOK",exact:true}).click();
  const portrait=page.locator(".living-tree-portrait");
  const reveal=page.locator(".living-tree-reveal");
  await portrait.waitFor({timeout:10000});
  const photos=await Promise.all([portrait,reveal].map(img => img.evaluate(node =>
    ({loaded:node.complete&&node.naturalWidth>0,source:new URL(node.src).pathname}))));
  if (!photos.every(p=>p.loaded)) throw Error("Owner-approved green Tree artwork missing");
  if (photos[0].source===photos[1].source) throw Error("Tree intent and reveal photos are not two actual states");

  await page.getByPlaceholder("Enter your intent").fill(objective);
  await page.getByRole("button",{name:"ENGAGE ASCENSION",exact:true}).click();
  await page.locator(".living-tree[data-tree-state='creating']").waitFor({timeout:20000});
  const outcome=await page.waitForFunction(() => {
    if (document.querySelector(".tree-studio")) return {ok:true};
    const error=document.querySelector(".living-tree-error");
    if (error) return {ok:false,message:error.textContent};
    return false;
  },null,{timeout:180000});
  const result=await outcome.jsonValue();
  if (!result?.ok) throw Error("Original ASCENSION did not produce a result: "+String(result?.message||"unknown"));
  await page.locator(".living-tree[data-tree-state='revealed']").waitFor();
  if(await page.locator(".designed-screen").count()) throw Error("Four-page pathway overlay replaced the Tree");
  const inspection=page.getByRole("navigation",{name:"Inspect the same invention"});
  for(const name of ["Blueprint","Dissect","Explode","Implode"]){
    await inspection.getByRole("button",{name,exact:true}).click();
    if(!await page.locator(".tree-studio").count()) throw Error("Tree vanished during "+name);
  }
  console.log("ASCENSION_OWNER_LIVING_TREE_ONE_PAGE_GOVERNED_RESULT_VERIFIED");
} catch(e) {
  const errors=await page.locator(".living-tree-error").allTextContents().catch(()=>[]);
  console.error("ASCENSION_LIVING_TREE_ACCEPTANCE_FAILED",e instanceof Error?e.message:String(e),errors.join(" | "));
  throw e;
} finally {
  try {await page.screenshot({path:"ascension-owner-living-tree-acceptance.png",fullPage:true});}catch{}
  await browser.close();
}
