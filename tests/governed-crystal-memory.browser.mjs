import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser=await chromium.launch();
const address="http://127.0.0.1:4182/tests/fixtures/device-local-first.html";
const code="owner-secret-verified-gateway-token-must-stay-encrypted";
const original="Owner exact original: guidance drone, awareness drone, shared memory dock.";
const receipt={
  source:"governed",
  requestId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  guestToken:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  receivedAt:new Date().toISOString(),
  choices:[{
    id:"actual-governed-delivery",
    title:"The recorded design",
    body:"The actual governed answer with genuine archive continuity.",
    parts:[{name:"Shared memory dock",location:"Charging cradle",purpose:"Preserve observed history"}],
    design:{title:"The recorded design",
      summary:"The actual governed answer with genuine archive continuity.",
      imageUrl:"https://example.invalid/owner-approved-original.png",
      blueprintUrl:null,modelUrl:null},
    modelStatus:"running",limitations:["Not measured or tested physically"],
  }],
  selectedIndex:null,
};
async function ready(context) {
  const page=await context.newPage();
  await page.goto(address);
  await page.waitForFunction(()=>Boolean(window.deviceTestAPI));
  return page;
}
try {
  const first=await browser.newContext();
  const page=await ready(first);
  const originalCrystal=await page.evaluate(async value=>
    window.deviceTestAPI.createDeviceCrystal(value),original);
  await page.evaluate(async ({id,receipt})=>
    window.deviceTestAPI.recordDeviceGovernedReceipt(id,receipt),{
    id:originalCrystal.id,receipt,
  });
  await page.evaluate(async ({id,requestId})=>
    window.deviceTestAPI.selectDeviceGovernedResult(id,requestId,0),{
    id:originalCrystal.id,requestId:receipt.requestId,
  });

  const raw=await page.evaluate(async ()=>{
    const opening=indexedDB.open("ascension-user-owned-knowledgeverse-v1");
    const db=await new Promise((ok,fail)=>{
      opening.onsuccess=()=>ok(opening.result);
      opening.onerror=()=>fail(opening.error);
    });
    const records=await new Promise((ok,fail)=>{
      const req=db.transaction("crystals","readonly").objectStore("crystals").getAll();
      req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);
    });
    db.close();
    return JSON.stringify(records);
  });
  for(const sensitive of [original,receipt.guestToken,receipt.choices[0].body,
    receipt.choices[0].design.imageUrl]){
    assert.ok(!raw.includes(sensitive),"Original designs and run credentials cannot be IndexedDB plaintext.");
  }
  await page.reload();
  await page.waitForFunction(()=>Boolean(window.deviceTestAPI));
  const recalled=await page.evaluate(id=>
    window.deviceTestAPI.readDeviceCrystal(id),originalCrystal.id);
  assert.equal(recalled.intent,original);
  assert.equal(recalled.governedResults.length,1);
  assert.equal(recalled.governedResults[0].selectedIndex,0);
  assert.equal(recalled.governedResults[0].choices[0].body,receipt.choices[0].body);
  assert.equal(recalled.verifiedGrowthCount,0);
  assert.equal(recalled.verifiedRevision,null);

  const passphrase="Owner archive passphrase encrypted continuation";
  const archive=await page.evaluate(async pass=>
    (await window.deviceTestAPI.createEncryptedLibraryBackup(pass)).text(),passphrase);
  for (const sensitive of [original,receipt.guestToken,
    receipt.choices[0].body,passphrase]){
    assert.ok(!archive.includes(sensitive),"Private backup must remain encrypted.");
  }
  const second=await browser.newContext();
  try {
    const device=await ready(second);
    const imported=await device.evaluate(async ({archive,passphrase})=>
      window.deviceTestAPI.restoreEncryptedLibraryBackup(archive,passphrase),{
        archive,passphrase,
      });
    assert.equal(imported.imported,1);
    const restored=await device.evaluate(id=>
      window.deviceTestAPI.readDeviceCrystal(id),originalCrystal.id);
    assert.equal(restored.intent,original);
    assert.equal(restored.governedResults.length,1);
    assert.equal(restored.governedResults[0].guestToken,receipt.guestToken);
    assert.equal(restored.governedResults[0].selectedIndex,0);
    assert.equal(restored.verifiedGrowthCount,0,
      "A governed delivered answer must not claim physical invention verification");

    // The second computer gets a real completed-model URL for the SAME run.
    const delivered=structuredClone(receipt);
    delivered.choices[0].modelStatus="completed";
    delivered.choices[0].design.modelUrl="https://example.invalid/actually-delivered.glb";
    await device.evaluate(async ({id,receipt})=>
      window.deviceTestAPI.recordDeviceGovernedReceipt(id,receipt),{
        id:originalCrystal.id,receipt:delivered,
      });
    const newerArchive=await device.evaluate(async pass=>
      (await window.deviceTestAPI.createEncryptedLibraryBackup(pass)).text(),passphrase);
    const merge=await page.evaluate(async ({archive,passphrase})=>
      window.deviceTestAPI.restoreEncryptedLibraryBackup(archive,passphrase),{
        archive:newerArchive,passphrase,
      });
    assert.equal(merge.imported,0);
    assert.equal(merge.mergedGovernedResults,1);
    const merged=await page.evaluate(id=>
      window.deviceTestAPI.readDeviceCrystal(id),originalCrystal.id);
    assert.equal(merged.intent,original);
    assert.equal(merged.governedResults[0].choices[0].design.modelUrl,
      "https://example.invalid/actually-delivered.glb");
    assert.equal(merged.governedResults[0].choices[0].design.imageUrl,
      receipt.choices[0].design.imageUrl,"Never replace the original picture");
    assert.equal(merged.governedResults[0].selectedIndex,0);
    assert.equal(merged.verifiedGrowthCount,0);
    const replay=await page.evaluate(async ({archive,passphrase})=>
      window.deviceTestAPI.restoreEncryptedLibraryBackup(archive,passphrase),{
        archive:newerArchive,passphrase,
      });
    assert.equal(replay.skipped,1);
  } finally { await second.close(); }
  await first.close();
  console.log("PASS: real AES-GCM browser-governed recall survives reload and cross-device encrypted backup while preserving original intent, selection and actual delivered GLB.");
} finally { await browser.close(); }
