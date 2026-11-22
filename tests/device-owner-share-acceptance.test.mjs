/**
 * Two independent real Node processes use a native filesystem share.
 * Never uses the owner's real Library Card or private shared-folder root data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("scripts/accept-private-library-share.mjs");
const CODE = "Synthetic-Test-Only-Private-Code-123456";
async function poll(check, maxMs=25000) {
  const end=Date.now()+maxMs;
  while(Date.now()<end) {
    try {
      const value=await check();
      if(value) return value;
    } catch(e) { if(e?.code!=="ENOENT") throw e; }
    await new Promise(done=>setTimeout(done,150));
  }
  throw Error("Two-device acceptance test timed out.");
}
function run(share) {
  const child=spawn(process.execPath,[SCRIPT,share],{
    cwd:resolve("."),
    env:{...process.env,ASCENSION_ACCEPTANCE_CI:"true",
      ASCENSION_ACCEPTANCE_TEST_CODE:CODE},
    stdio:["ignore","pipe","pipe"],windowsHide:true,
  });
  let stdout="",stderr="";
  child.stdout.on("data",value=>{stdout+=value.toString().slice(0,1024);});
  child.stderr.on("data",value=>{stderr+=value.toString().slice(0,1024);});
  const done=new Promise((ok,reject)=>{
    child.on("error",reject);
    child.on("close",(exitCode)=>ok({exitCode,stdout,stderr}));
  });
  return {child,done};
}
test("owner private-share acceptance converges with two real OS processes without touching other archives",{
  timeout:70000,
},async()=>{
  const share=await mkdtemp(join(tmpdir(),"ascension-owner-shared-"));
  const fakeName="ASCENSION-Private-Sync-"+randomUUID()+".ascension";
  const existing=join(share,fakeName);
  const originalBytes="ORIGINAL OWNER DATA MUST NEVER BE READ OR CHANGED";
  await writeFile(existing,originalBytes);
  let a,b;
  try {
    a=run(share);
    const session=await poll(async()=>{
      const names=await readdir(share);
      const name=names.find(x=>x.startsWith(".ascension-owner-acceptance-"));
      if(!name) return null;
      const folder=join(share,name);
      const files=await readdir(folder);
      if(files.some(x=>x.startsWith("ASCENSION-Private-Sync-"))) return folder;
      return null;
    });
    b=run(share);
    const [host,joiner]=await Promise.all([a.done,b.done]);
    assert.equal(host.exitCode,0,"Host failed: "+host.stderr);
    assert.equal(joiner.exitCode,0,"Joiner failed: "+joiner.stderr);
    assert.equal(await readFile(existing,"utf8"),originalBytes,
      "A user's existing shared-root file must never be changed.");
    assert.match(host.stdout,/PASS: host device/);
    assert.match(joiner.stdout,/PASS: join device/);
    const names=await readdir(session);
    for (const name of ["host-report.json","join-report.json"]) {
      assert(names.includes(name),"Missing report: "+name);
      const r=JSON.parse(await readFile(join(session,name),"utf8"));
      assert.equal(r.passed,true);
      assert.equal(r.checks.length,6);
      assert.equal(r.note.includes("does not exercise"),true);
      assert(!JSON.stringify(r).includes(CODE),
        "Reports must not persist the synthetic test-only code.");
    }
    const contents=await Promise.all(names
      .filter(x=>x.endsWith(".ascension"))
      .map(n=>readFile(join(session,n),"utf8")));
    assert(contents.length>=4,"Both independent agents should write archives");
    for(const raw of contents) {
      assert(!raw.includes("ASCENSION SYNTHETIC DEVICE ACCEPTANCE"),
        "Peer archives must never expose original intent plaintext.");
      assert(!raw.includes(CODE),"The synthetic test-only code must not be stored in archives.");
    }
  } finally {
    for(const item of [a,b]) if(item && item.child.exitCode===null && item.child.signalCode===null)
      item.child.kill();
    await rm(share,{recursive:true,force:true,maxRetries:12,retryDelay:200});
  }
});
