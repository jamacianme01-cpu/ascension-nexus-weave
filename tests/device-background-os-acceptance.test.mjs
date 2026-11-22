/**
 * OS-level acceptance: real Python HTTP companion, SQLite, Node background
 * process and operating-system folder. No mock companion and no browser tab.
 *
 * Runs independently on Windows and Linux GitHub runners. This does NOT claim
 * that an owner's personal LAN share or tablet has passed physical testing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { encryptArchive, decryptArchive, backgroundFileName } from "../scripts/ascension-background-sync.mjs";

const CARD = "a".repeat(64);
const PASSWORD = "Acceptance-test-private-password-1234";
const DATE = "2026-11-22T13:00:00.000Z";
const CRYSTAL = "11111111-1111-4111-8111-111111111111";
const JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORIGINAL = "Acceptance original: unchanged detailed owner invention intent";
const DEVELOPMENT = "Acceptance-only local draft made after the browser closed";
const SERVICE = "http://127.0.0.1:8788";
const ORIGIN = "http://127.0.0.1:4174";

async function until(check, deadlineMs = 18000) {
  const end = Date.now() + deadlineMs;
  let last;
  while (Date.now() < end) {
    try {
      const answer = await check();
      if (answer) return answer;
    } catch (error) { last = error; }
    await new Promise(done => setTimeout(done, 160));
  }
  throw new Error("OS acceptance condition not met: " +
    (last instanceof Error ? last.message : "timed out"));
}

async function post(route, content, origin = ORIGIN) {
  const r = await fetch(SERVICE + route, {
    method:"POST", headers:{"Content-Type":"application/json","Origin":origin},
    body:JSON.stringify(content), signal:AbortSignal.timeout(6000),
  });
  return {status:r.status, data:await r.json()};
}

test("OS-level closed-browser acceptance: pairing, draft delivery, stop and isolation", {
  timeout:90000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(),"ascension-native-acceptance-"));
  const folder = join(root,"owner-selected-share");
  const other = join(root,"different-folder");
  await mkdir(folder); await mkdir(other);
  const deviceId = randomUUID();
  const peerId = randomUUID();
  const workerArchive = join(folder,backgroundFileName(deviceId));
  const peerArchive = join(folder,"ASCENSION-Private-Sync-" + peerId + ".ascension");
  const original = {
    id:CRYSTAL, intent:ORIGINAL, createdAt:DATE, updatedAt:DATE,
    verifiedRevision:null, verifiedAt:null, verifiedGrowthCount:0,
    developing:false, drafts:[], queuedJobId:null,lastLocalJobAt:null,
  };
  await writeFile(peerArchive,encryptArchive([original], PASSWORD));
  const processLogs = [];
  const companion = spawn("python", [
    "scripts/ascension-device-companion.py",
    "--port", "8788", "--storage", join(root,"knowledgeverse.sqlite3"),
  ], {
    cwd:resolve("."),
    env:{...process.env, NODE_ENV:"test",
      ASCENSION_BG_ACCEPTANCE_INTERVAL_MS:"1600",
      ASCENSION_DEVICE_AUTOGROW:"false"},
    stdio:["ignore","pipe","pipe"],
    windowsHide:true,
  });
  companion.stdout.on("data", buffer => { processLogs.push(buffer.toString().slice(0,800)); });
  companion.stderr.on("data", buffer => { processLogs.push(buffer.toString().slice(0,800)); });
  let ended = false;
  companion.on("exit", () => { ended = true; });
  try {
    await until(async () => {
      if (ended) throw new Error("Python companion exited before readiness");
      const response = await fetch(SERVICE+"/v1/health",
        {signal:AbortSignal.timeout(1000)}).catch(() => null);
      return response?.ok;
    },20000);

    // Cross-origin sites cannot initiate pairing.
    const unauthorized = await post("/v1/background-sync-start",{},
      "https://untrusted.invalid");
    assert.equal(unauthorized.status,403);

    const token = randomUUID();
    const marker = ".ascension-bg-pair-"+token+".tmp";
    await writeFile(join(folder,marker),token);
    const pairing = {
      libraryKey:CARD,deviceId,directory:folder,passphrase:PASSWORD,token,marker,
    };

    // The path must point at the exact native-selected folder.
    const mismatched = await post("/v1/background-sync-start",
      {...pairing,directory:other});
    assert.equal(mismatched.status,400);
    assert.match(mismatched.data.error,/does not match/);

    // No browser is opened; the companion receives the approved pairing.
    const started = await post("/v1/background-sync-start",pairing);
    assert.equal(started.status,200,JSON.stringify(started.data));
    assert.equal(started.data.active,true);

    const initial = await until(async () => {
      const bytes = await readFile(workerArchive,"utf8");
      const value = decryptArchive(bytes,PASSWORD);
      return value.crystals?.some(c=>c.id===CRYSTAL && c.intent===ORIGINAL);
    });
    assert.equal(initial,true);
    const firstBytes = await readFile(workerArchive,"utf8");
    assert(!firstBytes.includes(ORIGINAL),
      "No original invention words may appear in the exchange file");

    // Write real completed history into the Python companion's SQLite DB,
    // simulating results finishing after the owner closes all tabs.
    const restored = await post("/v1/restore-finished",{
      libraryKey:CARD,
      snapshot:{
        format:"ascension-companion-finished-history",version:1,
        crystals:[{
          id:CRYSTAL,intent:ORIGINAL,createdAt:DATE,updatedAt:DATE,
          jobs:[{
            id:JOB,instruction:"Continue the original owner intent",
            status:"completed",model:"acceptance-installed-local-model",
            result:DEVELOPMENT,error:null,created_at:DATE,finished_at:DATE,
          }],
        }],
      },
    });
    assert.equal(restored.status,200,JSON.stringify(restored.data));
    assert.equal(restored.data.importedJobs,1);

    const updated = await until(async () => {
      const bytes = await readFile(workerArchive,"utf8");
      const data = decryptArchive(bytes,PASSWORD);
      const crystal = data.crystals?.find(c=>c.id===CRYSTAL);
      return crystal?.drafts?.some(d=>d.jobId===JOB &&
        d.content===DEVELOPMENT && d.status==="unverified_local_draft");
    },25000);
    assert.equal(updated,true,"Worker must deliver new SQLite history without a browser");
    const updatedBytes = await readFile(workerArchive,"utf8");
    assert(!updatedBytes.includes(ORIGINAL));
    assert(!updatedBytes.includes(DEVELOPMENT));

    const stopped = await post("/v1/background-sync-stop",{libraryKey:CARD});
    assert.equal(stopped.status,200,JSON.stringify(stopped.data));
    assert.equal(stopped.data.active,false);

    // Add a new peer after stop: the stopped worker must not publish it.
    const anotherPeer = randomUUID();
    const peerTwo = join(folder,"ASCENSION-Private-Sync-"+anotherPeer+".ascension");
    const another = {...original,id:"22222222-2222-4222-8222-222222222222",
      intent:"Another untouched original added only AFTER stop"};
    await writeFile(peerTwo,encryptArchive([another],PASSWORD));
    await new Promise(done=>setTimeout(done,4500));
    const afterStop = decryptArchive(await readFile(workerArchive,"utf8"),PASSWORD);
    assert.equal(afterStop.crystals.length,1,
      "Stopped background worker must not absorb subsequent peer changes");
    assert.equal(afterStop.crystals[0].intent,ORIGINAL);
    assert.equal(afterStop.crystals[0].drafts.length,1);
  } catch (error) {
    // No secret or intent data printed in failure diagnostics.
    throw new Error("OS integration test failed: " +
      (error instanceof Error ? error.message : String(error)) +
      " ; companion process exited=" + ended +
      " ; output excerpts=" + processLogs.join(" ").slice(0,500));
  } finally {
    if (!ended) {
      companion.kill();
      await new Promise(done => {
        if (companion.exitCode !== null || companion.signalCode !== null)
          return done();
        companion.once("exit",done);
        setTimeout(done,4000);
      });
    }
    await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  }
});
