import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch();
const passphrase = "Private Library Card Sync Passphrase 2026";
const address = "http://127.0.0.1:4182/tests/fixtures/device-local-first.html";

async function ready(context) {
  const page = await context.newPage();
  await page.goto(address);
  await page.waitForFunction(() => Boolean(window.deviceTestAPI));
  return page;
}
try {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const pageA = await ready(first);
  const pageB = await ready(second);

  const primary = await pageA.evaluate(async pass => {
    const api = window.deviceTestAPI;
    const item = await api.createDeviceCrystal("Original owner intent: create a private mechanical design.");
    await api.appendDeviceDraft(item.id, {
      jobId: "77777777-7777-4777-8777-777777777771",
      recordedAt: new Date().toISOString(),
      model: "installed-model-A",
      content: "Local experimental design notes A, not verified.",
      status: "unverified_local_draft",
    });
    await api.recordDeviceGovernedReceipt(item.id, {
      source: "governed",
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      guestToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      receivedAt: new Date().toISOString(),
      choices: [{
        id: "owner-private-knowledge",
        title: "Owner's recorded guided result",
        body: "An actual authorized engine result associated with this intent.",
        parts: [], design: null,
        modelStatus: null, limitations: [],
      }],
      selectedIndex: null,
    });
    const sharing = api.fakeSharedFolder();
    window.testFolder = sharing;
    window.testSession = api.startOwnerFolderSync(sharing.folder, pass, () => {});
    const status = await window.testSession.syncNow();
    return { id: item.id, intent: item.intent, summary: status };
  }, passphrase);
  assert.equal(primary.summary.peersRead, 0);

  const aFiles = await pageA.evaluate(() => window.testFolder.readFiles());
  assert.equal(Object.keys(aFiles).length, 1);
  const aFilename = Object.keys(aFiles)[0];
  assert.match(aFilename, /^ASCENSION-Private-Sync-[0-9a-f-]{36}\.ascension$/);
  assert.ok(!aFiles[aFilename].includes(primary.intent), "Do not write plaintext owner intents.");
  assert.ok(!aFiles[aFilename].includes("experimental design"), "Do not reveal development text.");
  assert.ok(!aFiles[aFilename].includes(passphrase), "Passphrase must stay in device memory.");
  assert.ok(!aFiles[aFilename].includes("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    "Governed guest authorization must remain encrypted in shared folders.");

  const other = await pageB.evaluate(async data => {
    const api = window.deviceTestAPI;
    const item = await api.createDeviceCrystal("Original owner intent B: independent local research.");
    await api.appendDeviceDraft(item.id, {
      jobId: "88888888-8888-4888-8888-888888888882",
      recordedAt: new Date().toISOString(),
      model: "installed-model-B",
      content: "Local draft from second device, not verified.",
      status: "unverified_local_draft",
    });
    const sharing = api.fakeSharedFolder(data.archives);
    window.testFolder = sharing;
    window.testSession = api.startOwnerFolderSync(sharing.folder, data.pass, () => {});
    const status = await window.testSession.syncNow();
    return { id: item.id, summary: status };
  }, { archives: aFiles, pass: passphrase });
  assert.equal(other.summary.peersRead, 1);
  assert.equal(other.summary.importedCrystals, 1);
  assert.equal((await pageB.evaluate(() => window.deviceTestAPI.listDeviceCrystals())).length, 2);
  const recoveredGoverned = await pageB.evaluate(id =>
    window.deviceTestAPI.readDeviceCrystal(id), primary.id);
  assert.equal(recoveredGoverned.intent, primary.intent);
  assert.equal(recoveredGoverned.governedResults.length, 1,
    "Owner-approved private folder sync must carry encrypted governed receipt memory");
  assert.equal(recoveredGoverned.governedResults[0].choices[0].id, "owner-private-knowledge");
  assert.equal(recoveredGoverned.verifiedGrowthCount, 0,
    "Synced governed delivery is not physical verification");

  const bFiles = await pageB.evaluate(() => window.testFolder.readFiles());
  assert.equal(Object.keys(bFiles).length, 2, "Each installation must write a separate archive.");
  assert.ok(bFiles[aFilename] === aFiles[aFilename], "Never modify the first device's archive.");
  const bFilename = Object.keys(bFiles).find(name => name !== aFilename);
  assert.ok(bFilename && bFiles[bFilename]);

  const copiedToA = await pageA.evaluate(async records => {
    window.testFolder.writeFiles(records);
    return window.testSession.syncNow();
  }, bFiles);
  assert.equal(copiedToA.peersRead, 1);
  assert.equal(copiedToA.importedCrystals, 1);
  const recoveredA = await pageA.evaluate(id => window.deviceTestAPI.readDeviceCrystal(id), other.id);
  assert.equal(recoveredA.intent, "Original owner intent B: independent local research.");
  assert.equal(recoveredA.drafts.length, 1);
  assert.equal(recoveredA.verifiedGrowthCount, 0);

  const replay = await pageA.evaluate(() => window.testSession.syncNow());
  assert.equal(replay.importedCrystals, 0);
  assert.equal(replay.mergedDrafts, 0);
  assert.equal((await pageA.evaluate(() => window.deviceTestAPI.listDeviceCrystals())).length, 2);

  const third = await browser.newContext();
  try {
    const pageC = await ready(third);
    const badPass = await pageC.evaluate(async options => {
      const api = window.deviceTestAPI;
      const sharing = api.fakeSharedFolder(options.files);
      const session = api.startOwnerFolderSync(sharing.folder, options.password, () => {});
      try {
        await session.syncNow();
        return { message: "unexpected success", archiveNames: Object.keys(sharing.readFiles()) };
      } catch (error) {
        return { message: error.message, archiveNames: Object.keys(sharing.readFiles()) };
      } finally {
        session.stop();
      }
    }, { files: aFiles, password: "incorrect shared device password" });
    assert.match(badPass.message, /Incorrect passphrase or damaged archive/);
    assert.deepEqual(badPass.archiveNames, [aFilename],
      "Failed decryption cannot write a device archive into the shared folder.");

    const altered = JSON.parse(aFiles[aFilename]);
    altered.data = (altered.data[0] === "A" ? "B" : "A") + altered.data.slice(1);
    const tampered = await pageC.evaluate(async options => {
      const api = window.deviceTestAPI;
      const sharing = api.fakeSharedFolder(options.files);
      const session = api.startOwnerFolderSync(sharing.folder, options.password, () => {});
      try { await session.syncNow(); return "unexpected success"; }
      catch (error) { return error.message; }
      finally { session.stop(); }
    }, { files: { [aFilename]: JSON.stringify(altered) }, password: passphrase });
    assert.match(tampered, /Incorrect passphrase or damaged archive/);
    assert.equal((await pageC.evaluate(() => window.deviceTestAPI.listDeviceCrystals())).length, 0);
  } finally {
    await third.close();
  }

  const savedLocalKeys = await pageA.evaluate(() => Object.keys(localStorage));
  assert.ok(savedLocalKeys.every(name => !/passphrase|password|shared.key/i.test(name)),
    "Do not persist password or derived folder-sync secret into localStorage.");

  await pageA.evaluate(() => window.testSession.stop());
  await pageB.evaluate(() => window.testSession.stop());
  await first.close();
  await second.close();
  console.log("PASS: encrypted owner-folder exchange converges across two devices, preserves original drafts and blocks wrong passwords/tampering without cloud services.");
} finally {
  await browser.close();
}
