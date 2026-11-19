#!/usr/bin/env node
/** Live ASCENSION V1 acceptance: genuine Tree submission and four selectable pathways. */
import { pathToFileURL } from "node:url";
if (!process.env.PLAYWRIGHT_MODULE) throw Error("Missing Playwright location");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const website = process.env.ASCENSION_V1_WEBSITE || "https://ascension-nexus-weave.fly.dev/";
const objective = "I want to make Worker drones for people with dementia.";
const browser = await chromium.launch({headless:true,args:["--no-sandbox"]});
const context = await browser.newContext({viewport:{width:1280,height:800}});
await context.addInitScript(() => {
  // Test the supported text alternative on a device with no microphone.
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:undefined});
});
const page = await context.newPage();
try {
  await page.goto(website,{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator('textarea[placeholder="Enter your objective"]').waitFor({timeout:20000});
  if (await page.getByRole("button",{name:"Business Planner"}).count())
    throw Error("V1 unexpectedly requires a category choice");
  await page.locator('textarea[placeholder="Enter your objective"]').fill(objective);
  await page.getByRole("button",{name:"ENGAGE ASCENSION",exact:true}).click();
  const signal = await page.waitForFunction(() => {
    const count=document.querySelectorAll('.designed-frame[data-screen="spiral"] .designed-reading').length;
    if (count===4) return {ok:true,count};
    const message=[...document.querySelectorAll(".ascension-tree-status")]
      .map(el=>el.textContent||"").join(" ");
    if (/submission failed|execution failed|execution rejected|delivery incomplete|runtime connection:/i.test(message))
      return {ok:false,message:message.slice(0,700)};
    return false;
  },null,{timeout:180000});
  const result=await signal.jsonValue();
  if (!result?.ok) throw Error("Actual Tree submission failed: "+(result?.message||"unknown"));
  // A rendered result must enter each one of the owner's existing inspection views.
  for(let index=0;index<4;index++){
    await page.locator('.designed-frame[data-screen="spiral"] .designed-hit').nth(index+2).click();
    await page.locator('.designed-frame[data-screen="assembled"] .designed-live-panel').waitFor({timeout:12000});
    const views=page.getByRole("navigation",{name:"Design inspection views"});
    for(const v of ["Blueprint","Dissect","Exploded","Imploded"]){
      await views.getByRole("button",{name:v,exact:true}).click();
      await page.locator('.designed-frame[data-screen="'+v.toLowerCase()+'"]').waitFor({timeout:12000});
    }
    await page.locator('.designed-margin[aria-label="Back"]').click();
    await page.locator('.designed-frame[data-screen="spiral"]').waitFor({timeout:12000});
  }
  console.log("ASCENSION_REAL_TREE_OBJECTIVE_FOUR_PATHWAYS_AND_INSPECTION_VIEWS_VERIFIED");
} catch(err){
  const status=await page.locator(".ascension-tree-status").allTextContents().catch(()=>[]);
  console.error("ASCENSION_LIVE_ENGAGE_FAILURE",err instanceof Error?err.message:String(err),
    "displayed_status=",status.join(" | ").slice(0,1000));
  throw err;
} finally {
  try{await page.screenshot({path:"ascension-v1-live-engage.png",fullPage:true});}catch{}
  await browser.close();
}
