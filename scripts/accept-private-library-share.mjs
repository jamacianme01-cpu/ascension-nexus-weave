#!/usr/bin/env node
/**
 * ASCENSION owner-device native shared-folder acceptance.
 *
 * Run the same command on TWO actual computers with access to the SAME
 * owner-selected private folder. The first creates an isolated synthetic
 * test session and prints a one-time test phrase. The second joins that
 * session, enters the phrase, and proves native encrypted archive convergence.
 *
 * It never reads, writes, renames, deletes or imports the owner's actual
 * ASCENSION-Private-Sync-*.ascension archives or browser IndexedDB.
 *
 * This tests physical share visibility and the actual crypto/merge format.
 * The real local companion + closed-browser lifecycle is separately exercised
 * by tests/device-background-os-acceptance.test.mjs on Windows and Linux.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, lstat, mkdir, writeFile, readFile, realpath } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { platform } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runBackgroundCycle, backgroundFileName, encryptArchive, decryptArchive,
} from "./ascension-background-sync.mjs";

const PREFIX = ".ascension-owner-acceptance-";
const SESSION_FORMAT = "ascension-owner-physical-share-acceptance";
const MAX_WAIT = 8 * 60 * 1000;
const CARD = "e".repeat(64); // TEST ONLY; not any user's real Library Card
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = "2026-11-22T13:00:00.000Z";
const emptyCompanion = async () => ({
  format:"ascension-companion-finished-history", version:1, crystals:[],
});
const sleep = ms => new Promise(done => setTimeout(done,ms));
function guard(condition, text) { if (!condition) throw new Error(text); }
function archiveName(id) { return "ASCENSION-Private-Sync-" + id + ".ascension"; }
function synthetic(id, role) {
  return {
    id, intent: "ASCENSION SYNTHETIC DEVICE ACCEPTANCE " + role + ": " + id,
    createdAt: ISO_DATE, updatedAt: ISO_DATE,
    verifiedRevision:null, verifiedAt:null, verifiedGrowthCount:0,
    developing:false, drafts:[], queuedJobId:null, lastLocalJobAt:null,
  };
}
async function jsonFile(path, limit = 4096) {
  const item = await lstat(path);
  guard(item.isFile() && !item.isSymbolicLink() && item.size > 0 && item.size <= limit,
    "Unexpected test-session metadata. Existing owner data was not modified.");
  return JSON.parse(await readFile(path,"utf8"));
}
async function exists(path) {
  try {
    const item = await lstat(path);
    return item.isFile() && !item.isSymbolicLink();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
async function requireShare(folder) {
  guard(typeof folder === "string" && folder.trim().length > 0,
    "Select an existing private shared folder.");
  const path = resolve(folder.trim());
  const info = await lstat(path);
  guard(info.isDirectory() && !info.isSymbolicLink(),
    "Only an existing directory, not a symbolic link, may be used.");
  await readdir(path); // Confirm owner-selected share is readable.
  return realpath(path);
}
async function waitFor(predicate, description, timeout = MAX_WAIT) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) { last = error; }
    await sleep(500);
  }
  throw new Error("The two devices did not complete " + description +
    (last instanceof Error ? ": " + last.message : "."));
}
async function findJoinable(share) {
  const found=[];
  for (const d of await readdir(share, {withFileTypes:true})) {
    if (!d.isDirectory() || !d.name.startsWith(PREFIX)) continue;
    const id=d.name.slice(PREFIX.length);
    if (!UUID_RE.test(id)) continue;
    const dir=join(share,d.name);
    try {
      const meta=await jsonFile(join(dir,"session.json"));
      if (meta.format !== SESSION_FORMAT || meta.id !== id ||
          !UUID_RE.test(meta.hostDeviceId) ||
          typeof meta.createdAt !== "string" ||
          Date.now()-Date.parse(meta.createdAt) > MAX_WAIT ||
          Date.parse(meta.createdAt)-Date.now() > 30_000 ||
          await exists(join(dir,"host-report.json")) ||
          await exists(join(dir,"join-report.json"))) continue;
      found.push({dir,meta});
    } catch { /* Never inspect other folders or malformed stale sessions. */ }
  }
  guard(found.length <= 1,
    "Multiple active test sessions exist. Use a dedicated empty shared folder or let one finish.");
  return found[0] ?? null;
}
async function writeNew(path, content) {
  await writeFile(path,content,{flag:"wx",mode:0o600});
}
async function assertProtectedArchive(path, secret, expected) {
  const raw=await readFile(path,"utf8");
  const archive=decryptArchive(raw,secret);
  const actual=archive.crystals.map(c=>[c.id,c.intent]);
  for(const record of expected) {
    guard(actual.some(x=>x[0]===record.id && x[1]===record.intent),
      "An original synthetic intent was lost or replaced.");
    guard(!raw.includes(record.intent),"Plaintext was found in encrypted test data.");
  }
  guard(archive.crystals.length===expected.length,
    "The private test archive had unexpected or duplicated crystals.");
  guard(archive.crystals.every(c=>c.verifiedGrowthCount===0 && c.verifiedRevision===null),
    "An unverified synthetic test was marked verified.");
  return archive;
}
function report(role, info) {
  return JSON.stringify({
    format:"ascension-owner-device-acceptance-report",version:1,
    passed:true, role, os:platform(), at:new Date().toISOString(),
    runId:info.id,
    checks:["shared-directory-visibility","two-owner-originals-preserved",
      "encrypted-ciphertext-only","peer-archive-convergence",
      "replay-idempotency","no-false-verification"],
    ownerPersonalDevicesTested:true,
    note:"This test does not exercise the browser's OS permission dialog or continuous background daemon.",
  },null,2)+"\n";
}

/**
 * Starts a standalone test on an owner-chosen share without touching
 * ASCENSION's real root archive files. Call once on each participating device.
 * secret is synthetic test-only; never provide the owner's real passphrase.
 */
export async function runOwnerSharedFolderAcceptance({
  shareFolder, syntheticPassphrase, onStatus = () => {}, timeoutMs = MAX_WAIT,
}) {
  const share=await requireShare(shareFolder);
  const current=await findJoinable(share);
  const role=current ? "join" : "host";
  if (role === "host") {
    const id=randomUUID(), hostDeviceId=randomUUID(), crystalId=randomUUID();
    const session=join(share,PREFIX+id);
    await mkdir(session);
    const manifest={format:SESSION_FORMAT,version:1,id,createdAt:new Date().toISOString(),
      hostDeviceId,hostCrystalId:crystalId};
    await writeNew(join(session,"session.json"),JSON.stringify(manifest));
    const password=syntheticPassphrase ?? randomBytes(24).toString("base64url");
    guard(password.length>=12,"Use a test-only passphrase of at least 12 characters.");
    const hostOriginal=synthetic(crystalId,"FIRST DEVICE");
    await writeNew(join(session,archiveName(hostDeviceId)),
      encryptArchive([hostOriginal],password));
    onStatus({role, session, testCode:password});
    const joined=await waitFor(async()=>{
      if (!await exists(join(session,"join.json"))) return null;
      const v=await jsonFile(join(session,"join.json"));
      guard(v.format === SESSION_FORMAT && v.id === id && UUID_RE.test(v.joinDeviceId)
        && UUID_RE.test(v.joinCrystalId) && v.joinDeviceId !== hostDeviceId,
        "The joining device submitted invalid test metadata.");
      return v;
    },"shared-folder join",timeoutMs);
    const joinOriginal=synthetic(joined.joinCrystalId,"SECOND DEVICE");
    await assertProtectedArchive(join(session,archiveName(joined.joinDeviceId)),
      password,[joinOriginal]);
    const local={directory:session,passphrase:password,browserDeviceId:hostDeviceId,
      libraryKey:CARD};
    await runBackgroundCycle(local,emptyCompanion);
    await assertProtectedArchive(join(session,backgroundFileName(hostDeviceId)),
      password,[hostOriginal,joinOriginal]);
    await writeNew(join(session,"host-ready.json"),JSON.stringify({id,passed:true}));
    await waitFor(async()=>{
      if (!await exists(join(session,"join-report.json"))) return false;
      const v=await jsonFile(join(session,"join-report.json"));
      guard(v.passed && v.runId===id,"The joining device did not pass.");
      return true;
    },"second-device convergence report",timeoutMs);
    await assertProtectedArchive(join(session,backgroundFileName(joined.joinDeviceId)),
      password,[hostOriginal,joinOriginal]);
    await runBackgroundCycle(local,emptyCompanion);
    await assertProtectedArchive(join(session,backgroundFileName(hostDeviceId)),
      password,[hostOriginal,joinOriginal]);
    await writeNew(join(session,"host-report.json"),report(role,manifest));
    onStatus({role,passed:true,session,report:join(session,"host-report.json")});
    return {role,passed:true,report:join(session,"host-report.json"),session};
  }
  const {dir:session,meta}=current;
  guard(typeof syntheticPassphrase==="string" && syntheticPassphrase.length >= 12,
    "The second device needs the test-only code displayed by the first.");
  const hostOriginal=synthetic(meta.hostCrystalId,"FIRST DEVICE");
  await assertProtectedArchive(join(session,archiveName(meta.hostDeviceId)),
    syntheticPassphrase,[hostOriginal]);
  const joinDeviceId=randomUUID(), joinCrystalId=randomUUID();
  const joinOriginal=synthetic(joinCrystalId,"SECOND DEVICE");
  await writeNew(join(session,archiveName(joinDeviceId)),
    encryptArchive([joinOriginal],syntheticPassphrase));
  await writeNew(join(session,"join.json"),JSON.stringify({
    format:SESSION_FORMAT,id:meta.id,joinDeviceId,joinCrystalId,
  }));
  await waitFor(async()=>{
    if (!await exists(join(session,"host-ready.json"))) return false;
    const v=await jsonFile(join(session,"host-ready.json"));
    return v.passed===true && v.id===meta.id;
  },"first-device encrypted merge",timeoutMs);
  await assertProtectedArchive(join(session,backgroundFileName(meta.hostDeviceId)),
    syntheticPassphrase,[hostOriginal,joinOriginal]);
  const local={directory:session,passphrase:syntheticPassphrase,
    browserDeviceId:joinDeviceId,libraryKey:CARD};
  await runBackgroundCycle(local,emptyCompanion);
  await assertProtectedArchive(join(session,backgroundFileName(joinDeviceId)),
    syntheticPassphrase,[hostOriginal,joinOriginal]);
  await runBackgroundCycle(local,emptyCompanion);
  await assertProtectedArchive(join(session,backgroundFileName(joinDeviceId)),
    syntheticPassphrase,[hostOriginal,joinOriginal]);
  await writeNew(join(session,"join-report.json"),report("join",meta));
  onStatus({role:"join",passed:true,session,report:join(session,"join-report.json")});
  return {role:"join",passed:true,report:join(session,"join-report.json"),session};
}
async function main() {
  const folder=process.argv[2];
  const prompt = createInterface({input:process.stdin,output:process.stdout});
  try {
    const share=folder||await prompt.question("Owner-selected shared folder path: ");
    const selected=await requireShare(share);
    const existing=await findJoinable(selected);
    const automated=process.env.ASCENSION_ACCEPTANCE_CI==="true";
    const code=automated ? process.env.ASCENSION_ACCEPTANCE_TEST_CODE : existing
      ? await prompt.question("Test-only code from first device (not your real passphrase): ")
      : undefined;
    if (existing && !code) throw Error("The second device needs the synthetic test code.");
    await runOwnerSharedFolderAcceptance({
      shareFolder:selected,syntheticPassphrase:code,
      onStatus:item=>{
        if (item.testCode && !automated) {
          process.stdout.write("FIRST DEVICE: keep this test running. On the second device run the same command.\n");
          process.stdout.write("Enter this SYNTHETIC TEST CODE on the second device: "+item.testCode+"\n");
        }
        if (item.passed) process.stdout.write(
          "PASS: "+item.role+" device verified encrypted shared-folder convergence.\n"+
          "Non-private report: "+item.report+"\n");
      },
    });
  } finally { prompt.close(); }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{
    process.stderr.write("ASCENSION private share acceptance NOT VERIFIED: "+
      (error instanceof Error?error.message:"Test failed.")+"\n");
    process.exitCode=1;
  });
}
