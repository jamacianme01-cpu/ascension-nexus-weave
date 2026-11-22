import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  encryptArchive, decryptArchive, runBackgroundCycle, backgroundFileName,
} from "../scripts/ascension-background-sync.mjs";

const PASS = "this-is-a-private-owner-controlled-passphrase";
const CARD = "a".repeat(64);
const DATE = "2026-11-22T12:00:00.000Z";
const CRYSTAL = "11111111-1111-4111-8111-111111111111";
const CRYSTAL2 = "22222222-2222-4222-8222-222222222222";
const DRAFT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function crystal(id, intent, drafts = []) {
  return {id,intent, createdAt:DATE,updatedAt:DATE,verifiedRevision:null,
    verifiedAt:null,verifiedGrowthCount:0,developing:false,drafts,
    queuedJobId:null,lastLocalJobAt:null};
}
function draft(jobId, content) {
  return {jobId,model:"owner-installed-local-model",content,
    status:"unverified_local_draft",recordedAt:DATE};
}
function cfg(directory, id) {
  return {directory,passphrase:PASS,browserDeviceId:id,libraryKey:CARD};
}
async function withFolder(fn) {
  const folder=await mkdtemp(join(tmpdir(),"ascension-private-bg-"));
  try { await fn(folder); } finally { await rm(folder,{recursive:true,force:true}); }
}
test("desktop companion exchanges encrypted originals while both browser tabs are closed",async()=>{
  await withFolder(async directory=>{
    const a=randomUUID(), b=randomUUID();
    const original = "My original detailed intent must never be replaced";
    const second = "Another device original";
    await writeFile(join(directory,"ASCENSION-Private-Sync-"+a+".ascension"),
      encryptArchive([crystal(CRYSTAL,original)],PASS));
    await writeFile(join(directory,"ASCENSION-Private-Sync-"+b+".ascension"),
      encryptArchive([crystal(CRYSTAL2,second)],PASS));
    const noCompanion=async()=>({format:"ascension-companion-finished-history",version:1,crystals:[]});
    const first=await runBackgroundCycle(cfg(directory,a),noCompanion);
    const secondResult=await runBackgroundCycle(cfg(directory,b),noCompanion);
    assert.equal(first.crystals,2);
    assert.equal(secondResult.crystals,2);
    const agentA=await readFile(join(directory,backgroundFileName(a)),"utf8");
    const agentB=await readFile(join(directory,backgroundFileName(b)),"utf8");
    assert(!agentA.includes(original) && !agentA.includes(second));
    assert(!agentB.includes(original) && !agentB.includes(second));
    const records=decryptArchive(agentB,PASS).crystals;
    assert.deepEqual(new Set(records.map(record=>record.intent)),new Set([original,second]));
    await runBackgroundCycle(cfg(directory,a),noCompanion);
    assert.equal(decryptArchive(await readFile(join(directory,backgroundFileName(a)),"utf8"),PASS).crystals.length,2);
  });
});
test("closed-browser native exchange retains encrypted governed memory, selected result and later real GLB",async()=>{
  await withFolder(async directory=>{
    const a=randomUUID(),b=randomUUID();
    const original="Owner original: two autonomous guidance/environment drones and shared-memory dock";
    const secret="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const result={
      source:"governed",requestId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      guestToken:secret,receivedAt:DATE,selectedIndex:0,
      choices:[{
        id:"owner-governed",title:"Guidance system",
        body:"Exactly the actual returned governed design",
        parts:[],limitations:["Not physically verified"],modelStatus:"running",
        design:{title:"Guidance system",summary:"Exactly the actual returned governed design",
          imageUrl:"https://example.invalid/owner-original.png",blueprintUrl:null,modelUrl:null},
      }],
    };
    const later=structuredClone(result);
    later.selectedIndex=null;
    later.choices[0].modelStatus="completed";
    later.choices[0].design.modelUrl="https://example.invalid/real-hunyuan-model.glb";
    await writeFile(join(directory,"ASCENSION-Private-Sync-"+a+".ascension"),
      encryptArchive([{...crystal(CRYSTAL,original),governedResults:[result]}],PASS));
    await writeFile(join(directory,"ASCENSION-Private-Sync-"+b+".ascension"),
      encryptArchive([{...crystal(CRYSTAL,original),governedResults:[later]}],PASS));
    const noCompanion=async()=>({format:"ascension-companion-finished-history",version:1,crystals:[]});
    await runBackgroundCycle(cfg(directory,a),noCompanion);
    const file=await readFile(join(directory,backgroundFileName(a)),"utf8");
    for(const sensitive of [original,secret,result.choices[0].body])
      assert.ok(!file.includes(sensitive),"Owner memory is private even after browsers close");
    const records=decryptArchive(file,PASS).crystals;
    assert.equal(records.length,1);
    assert.equal(records[0].intent,original);
    assert.equal(records[0].governedResults.length,1);
    const saved=records[0].governedResults[0];
    assert.equal(saved.selectedIndex,0);
    assert.equal(saved.choices[0].design.imageUrl,
      "https://example.invalid/owner-original.png");
    assert.equal(saved.choices[0].design.modelUrl,
      "https://example.invalid/real-hunyuan-model.glb");
    assert.equal(records[0].verifiedGrowthCount,0);
    await runBackgroundCycle(cfg(directory,a),noCompanion);
    const replay=decryptArchive(await readFile(join(directory,backgroundFileName(a)),"utf8"),PASS).crystals;
    assert.equal(replay[0].governedResults.length,1,
      "Repeated closed-browser sync cannot duplicate governed history");
  });
});

test("finished on-device companion developments enter encrypted peer archive after browser closes",async()=>{
  await withFolder(async directory=>{
    const a=randomUUID(), b=randomUUID();
    const original="A preserved owner instruction";
    await writeFile(join(directory,"ASCENSION-Private-Sync-"+a+".ascension"),
      encryptArchive([crystal(CRYSTAL,original)],PASS));
    await runBackgroundCycle(cfg(directory,a),async()=>({
      format:"ascension-companion-finished-history",version:1,
      crystals:[{id:CRYSTAL,intent:original,createdAt:DATE,updatedAt:DATE,
        jobs:[{id:DRAFT,status:"completed",model:"owner-installed-local-model",
          result:"Unverified result after browser closed",finished_at:DATE}]}],
    }));
    const peer = await runBackgroundCycle(cfg(directory,b),async()=>({
      format:"ascension-companion-finished-history",version:1,crystals:[],
    }));
    assert.equal(peer.crystals,1);
    const received=decryptArchive(await readFile(join(directory,backgroundFileName(b)),"utf8"),PASS);
    assert.equal(received.crystals[0].intent,original);
    assert.equal(received.crystals[0].drafts[0].jobId,DRAFT);
    assert.equal(received.crystals[0].drafts[0].status,"unverified_local_draft");
    assert.equal(received.crystals[0].verifiedGrowthCount,0);
    await runBackgroundCycle(cfg(directory,b),async()=>({
      format:"ascension-companion-finished-history",version:1,crystals:[],
    }));
    const replay=decryptArchive(await readFile(join(directory,backgroundFileName(b)),"utf8"),PASS);
    assert.equal(replay.crystals[0].drafts.length,1);
  });
});
test("wrong passphrase, conflicting originals and tampering cannot replace background state",async()=>{
  await withFolder(async directory=>{
    const a=randomUUID(), b=randomUUID();
    const original="KEEP ORIGINAL";
    const ownPath=join(directory,"ASCENSION-Private-Sync-"+a+".ascension");
    await writeFile(ownPath,encryptArchive([crystal(CRYSTAL,original)],PASS));
    const empty=async()=>({format:"ascension-companion-finished-history",version:1,crystals:[]});
    await runBackgroundCycle(cfg(directory,a),empty);
    const agentPath=join(directory,backgroundFileName(a));
    const before=await readFile(agentPath,"utf8");
    await assert.rejects(runBackgroundCycle({...cfg(directory,a),passphrase:"wrong-password-12345"},empty),
      /passphrase|tampered/i);
    assert.equal(await readFile(agentPath,"utf8"),before);
    const conflict=join(directory,"ASCENSION-Private-Sync-"+b+".ascension");
    await writeFile(conflict,encryptArchive([crystal(CRYSTAL,"DIFFERENT ORIGINAL")],PASS));
    await assert.rejects(runBackgroundCycle(cfg(directory,a),empty),/Original intent conflict/);
    assert.equal(await readFile(agentPath,"utf8"),before);
    const archived=JSON.parse(await readFile(conflict,"utf8"));
    archived.data=archived.data.slice(0,50)+("A"===archived.data[50]?"B":"A")+archived.data.slice(51);
    await writeFile(conflict,JSON.stringify(archived));
    await assert.rejects(runBackgroundCycle(cfg(directory,a),empty),/tampered|Incorrect passphrase/);
    assert.equal(await readFile(agentPath,"utf8"),before);
    const files=await readdir(directory);
    assert.equal(files.filter(name=>name.endsWith(".tmp")).length,0);
  });
});
