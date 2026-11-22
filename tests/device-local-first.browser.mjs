import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4182/tests/fixtures/device-local-first.html");
  await page.waitForFunction(() => Boolean(window.deviceTestAPI));

  const intent = "Owner's exact private Mech Suit transmission rail design: preserve wording.";
  const saved = await page.evaluate(async value =>
    window.deviceTestAPI.createDeviceCrystal(value), intent);
  assert.equal(saved.intent, intent);
  assert.equal(saved.verifiedGrowthCount, 0);
  assert.equal(saved.drafts.length, 0);
  assert.equal((await page.evaluate(() => window.deviceTestAPI.listDeviceCrystals())).length, 1);

  // The original text must NEVER be stored in IndexedDB in plaintext.
  const inspected = await page.evaluate(async () => {
    const open = indexedDB.open("ascension-user-owned-knowledgeverse-v1");
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction(["crystals", "config"], "readonly");
    const recordReq = tx.objectStore("crystals").getAll();
    const keyReq = tx.objectStore("config").get("nonextractable-aes-gcm-v1");
    const records = await new Promise((resolve, reject) => {
      recordReq.onsuccess = () => resolve(recordReq.result);
      recordReq.onerror = () => reject(recordReq.error);
    });
    const key = await new Promise((resolve, reject) => {
      keyReq.onsuccess = () => resolve(keyReq.result);
      keyReq.onerror = () => reject(keyReq.error);
    });
    db.close();
    return { records, keyExtractable: key.extractable, keyAlgorithm: key.algorithm.name };
  });
  assert.equal(inspected.records.length, 1);
  assert.ok(!JSON.stringify(inspected.records).includes(intent),
    "Private intent text must never be saved as plaintext in the browser.");
  assert.equal(inspected.keyAlgorithm, "AES-GCM");
  assert.equal(inspected.keyExtractable, false, "Encryption key cannot be exported.");

  const jobId = "77777777-7777-4777-8777-777777777777";
  await page.evaluate(async ([id, job]) => {
    await window.deviceTestAPI.markDeviceJob(id, job);
    await window.deviceTestAPI.appendDeviceDraft(id, {
      jobId: job, recordedAt: new Date().toISOString(),
      model: "device-test-model", content: "Test-generated draft, not verified knowledge.",
      status: "unverified_local_draft",
    });
  }, [saved.id, jobId]);

  // Duplicate polling must not create fictitious extra development.
  await page.evaluate(async ([id, job]) => {
    await window.deviceTestAPI.appendDeviceDraft(id, {
      jobId: job, recordedAt: new Date().toISOString(),
      model: "device-test-model", content: "Test-generated draft, not verified knowledge.",
      status: "unverified_local_draft",
    });
  }, [saved.id, jobId]);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.deviceTestAPI));
  const recovered = await page.evaluate(id => window.deviceTestAPI.readDeviceCrystal(id), saved.id);
  assert.equal(recovered.intent, intent);
  assert.equal(recovered.drafts.length, 1);
  assert.equal(recovered.verifiedGrowthCount, 0,
    "A local AI draft is not governed verified knowledge.");
  assert.equal(recovered.verifiedRevision, null);
  assert.equal(recovered.developing, false);
  await context.close();
  console.log("PASS: encrypted on-device intent survives browser reload, remains unexportable, duplicate drafts do not fake growth.");
} finally {
  await browser.close();
}
