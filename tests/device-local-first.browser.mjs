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

  // Owner-exported archive is portable between fresh browser profiles, but
  // never contains plaintext inventions or exports a device CryptoKey.
  const passphrase = "correct-horse-battery-local-library";
  const archive = await page.evaluate(async pass =>
    (await window.deviceTestAPI.createEncryptedLibraryBackup(pass)).text(), passphrase);
  assert.ok(!archive.includes(intent), "Encrypted archive must not expose invention text.");
  assert.ok(!archive.includes("Test-generated draft"), "Drafts must remain encrypted.");
  const header = JSON.parse(archive);
  assert.equal(header.format, "ascension-library-card-encrypted");
  assert.equal(header.iterations, 310000);
  assert.equal(header.kdf, "PBKDF2-SHA-256");
  assert.equal(header.cipher, "AES-256-GCM");
  assert.ok(!("crystals" in header), "Unencrypted header must not contain crystal data.");

  const originalCard = await page.evaluate(() =>
    localStorage.getItem("ascension-library-card-capability-v1"));

  // Failed decryption and ciphertext tampering MUST NOT change user storage.
  const failed = await page.evaluate(async text => {
    try {
      await window.deviceTestAPI.restoreEncryptedLibraryBackup(text, "incorrect-passphrase-1234");
      return "unexpected success";
    } catch (error) {
      return error.message;
    }
  }, archive);
  assert.match(failed, /Incorrect passphrase or damaged archive/);
  assert.equal((await page.evaluate(() => window.deviceTestAPI.listDeviceCrystals())).length, 1);

  const forged = { ...header, data: (header.data[0] === "A" ? "B" : "A") + header.data.slice(1) };
  const tamperResult = await page.evaluate(async payload => {
    try {
      await window.deviceTestAPI.restoreEncryptedLibraryBackup(payload.text, payload.password);
      return "unexpected success";
    } catch (error) {
      return error.message;
    }
  }, { text: JSON.stringify(forged), password: passphrase });
  assert.match(tamperResult, /Incorrect passphrase or damaged archive/);

  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await second.goto("http://127.0.0.1:4182/tests/fixtures/device-local-first.html");
    await second.waitForFunction(() => Boolean(window.deviceTestAPI));
    const imported = await second.evaluate(async payload =>
      window.deviceTestAPI.restoreEncryptedLibraryBackup(payload.archive, payload.password),
      { archive, password: passphrase });
    assert.deepEqual(imported, { imported: 1, skipped: 0, totalInArchive: 1 });

    const newCard = await second.evaluate(() =>
      localStorage.getItem("ascension-library-card-capability-v1"));
    assert.notEqual(newCard, originalCard, "Original device access capability must not be transferred.");

    const restored = await second.evaluate(id => window.deviceTestAPI.readDeviceCrystal(id), saved.id);
    assert.equal(restored.intent, intent);
    assert.equal(restored.drafts.length, 1);
    assert.equal(restored.drafts[0].jobId, jobId);
    assert.equal(restored.verifiedRevision, null);
    assert.equal(restored.verifiedGrowthCount, 0, "Imported draft is never verified proof.");
    assert.equal(restored.queuedJobId, null, "Old device jobs must not restart as active jobs.");

    const repeated = await second.evaluate(async payload =>
      window.deviceTestAPI.restoreEncryptedLibraryBackup(payload.archive, payload.password),
      { archive, password: passphrase });
    assert.deepEqual(repeated, { imported: 0, skipped: 1, totalInArchive: 1 },
      "An existing original must never be overwritten by an old backup.");

    const afterRepeat = await second.evaluate(() => window.deviceTestAPI.listDeviceCrystals());
    assert.equal(afterRepeat.length, 1);
  } finally {
    await other.close();
  }

  await context.close();
  console.log("PASS: encrypted on-device intent survives browser reload, remains unexportable, duplicate drafts do not fake growth.");
} finally {
  await browser.close();
}
