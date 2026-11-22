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


  // A finished desktop-companion result that was NEVER synchronized into
  // IndexedDB must still travel in the encrypted Library Card backup.
  const unsyncedJob = "88888888-8888-4888-8888-888888888888";
  const unsyncedText = "Offline-created owner knowledge preserved from the companion SQLite history.";
  const companionSnapshot = {
    format: "ascension-companion-finished-history", version: 1,
    crystals: [{
      id: saved.id, intent,
      createdAt: saved.createdAt, updatedAt: saved.updatedAt,
      jobs: [{
        id: unsyncedJob, instruction: "Original owner intent: " + intent,
        status: "completed", model: "installed-local-model",
        result: unsyncedText, error: null,
        created_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      }],
    }],
  };
  let exposedPassphrase = false;
  await page.route("http://127.0.0.1:8788/v1/snapshot", async route => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      if ("passphrase" in body || "password" in body) exposedPassphrase = true;
    }
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4182",
      "Access-Control-Allow-Private-Network": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Content-Type": "application/json",
    };
    await route.fulfill({
      status: req.method() === "OPTIONS" ? 204 : 200,
      headers,
      body: req.method() === "OPTIONS" ? "" : JSON.stringify(companionSnapshot),
    });
  });
  const completeArchive = await page.evaluate(async password =>
    (await window.deviceTestAPI.createEncryptedLibraryBackup(password)).text(), passphrase);
  assert.equal(exposedPassphrase, false, "Passphrase must never reach local companion HTTP.");
  assert.ok(!completeArchive.includes(unsyncedText), "Unsynced companion history must be encrypted.");
  assert.ok(!completeArchive.includes(intent));

  const fresh = await browser.newContext();
  try {
    const recoveredPage = await fresh.newPage();
    await recoveredPage.goto("http://127.0.0.1:4182/tests/fixtures/device-local-first.html");
    await recoveredPage.waitForFunction(() => Boolean(window.deviceTestAPI));
    const recovery = await recoveredPage.evaluate(async payload =>
      window.deviceTestAPI.restoreEncryptedLibraryBackup(payload.archive, payload.password),
      { archive: completeArchive, password: passphrase });
    assert.equal(recovery.companionIncluded, true);
    assert.equal(recovery.companionRestored, false,
      "Browser backup must succeed even if desktop companion is off on the receiving device.");
    assert.equal(recovery.imported, 1);
    const restoredCrystal = await recoveredPage.evaluate(id =>
      window.deviceTestAPI.readDeviceCrystal(id), saved.id);
    assert.equal(restoredCrystal.drafts.length, 2);
    assert.ok(restoredCrystal.drafts.some(item => item.jobId === unsyncedJob &&
      item.content === unsyncedText));
    assert.equal(restoredCrystal.verifiedGrowthCount, 0);

    // Same owner crystal already present: restore only the newly missing draft.
    const archiveNoCompanion = archive;
    const baseFirst = await browser.newContext();
    try {
      const mergePage = await baseFirst.newPage();
      await mergePage.goto("http://127.0.0.1:4182/tests/fixtures/device-local-first.html");
      await mergePage.waitForFunction(() => Boolean(window.deviceTestAPI));
      await mergePage.evaluate(async payload =>
        window.deviceTestAPI.restoreEncryptedLibraryBackup(payload.archive, payload.password),
        { archive: archiveNoCompanion, password: passphrase });
      const merged = await mergePage.evaluate(async payload =>
        window.deviceTestAPI.restoreEncryptedLibraryBackup(payload.archive, payload.password),
        { archive: completeArchive, password: passphrase });
      assert.equal(merged.imported, 0);
      assert.equal(merged.mergedDrafts, 1);
      const both = await mergePage.evaluate(id => window.deviceTestAPI.readDeviceCrystal(id), saved.id);
      assert.equal(both.drafts.length, 2);
      assert.ok(both.drafts.some(x => x.jobId === jobId));
      assert.ok(both.drafts.some(x => x.jobId === unsyncedJob));
      const repeat = await mergePage.evaluate(async payload =>
        window.deviceTestAPI.restoreEncryptedLibraryBackup(payload.archive, payload.password),
        { archive: completeArchive, password: passphrase });
      assert.equal(repeat.imported, 0);
      assert.equal(repeat.skipped, 1);
      assert.equal((await mergePage.evaluate(id =>
        window.deviceTestAPI.readDeviceCrystal(id), saved.id)).drafts.length, 2);
    } finally {
      await baseFirst.close();
    }
  } finally {
    await fresh.close();
  }

  await context.close();
  console.log("PASS: encrypted on-device intent survives browser reload, remains unexportable, duplicate drafts do not fake growth.");
} finally {
  await browser.close();
}
