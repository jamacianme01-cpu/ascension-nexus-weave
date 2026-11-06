import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const port = "4291";
const base = "http://127.0.0.1:" + port;
const key = "f".repeat(96); // Test-only key; never deploy this credential.
const runtime = spawn(process.execPath, [".output/server/index.mjs"], {
  env: { ...process.env, HOST:"127.0.0.1", NITRO_HOST:"127.0.0.1", PORT:port,
    NITRO_PORT:port, ASCENSION_REMOTE_BRAIN_ENABLED:"true",
    ASCENSION_REMOTE_BRAIN_KEY:key, LOCAL_LLM_BASE_URL:"",
    ASCENSION_ALLOW_OPENAI_AI:"false", OPENAI_API_KEY:"" },
  stdio:["ignore","pipe","pipe"],
});
let errors="";
runtime.stderr.on("data", d => {errors+=String(d).slice(-2000);});
async function get(path, options) { return fetch(base + path, options); }
try {
  let online = false;
  for (let i = 0; i < 50; i++) {
    await sleep(150);
    if (runtime.exitCode !== null) throw new Error("Server exited: " + errors);
    try { const r=await get("/api/public/ascension/independent"); if(r.ok){online=true;break;} } catch {}
  }
  assert.ok(online, "Nitro server must be reachable");
  const before=await (await get("/api/public/ascension/independent")).json();
  assert.equal(before.brain_mode,"designated-old-pc");
  assert.equal(before.brain_connected,false);

  const offline=await get("/api/public/ascension/independent",{
    method:"POST", headers:{"content-type":"application/json"},
    body:JSON.stringify({objective:"make worker drones",phase:"pathways"}),
  });
  assert.equal(offline.status,503,"Offline older computer must never fall back to cloud models");
  assert.match(JSON.stringify(await offline.json()),/older computer is not connected/);

  const unauthorized=await get("/api/public/ascension/brain-worker");
  assert.equal(unauthorized.status,401);
  const headers={"x-ascension-brain-key":key};
  const ping=await get("/api/public/ascension/brain-worker",{headers});
  assert.equal(ping.status,200);
  assert.equal((await ping.json()).job,null);
  const after=await (await get("/api/public/ascension/independent")).json();
  assert.equal(after.brain_connected,true);

  const resultPromise=get("/api/public/ascension/independent",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({objective:"make worker drones",phase:"pathways"}),
  });
  let job=null;
  for(let i=0;i<30;i++){
    await sleep(100);
    const r=await get("/api/public/ascension/brain-worker",{headers});
    assert.equal(r.status,200);
    job=(await r.json()).job;
    if(job)break;
  }
  assert.ok(job,"Browser objective must be picked up by older-PC worker");
  assert.deepEqual(job.input,{objective:"make worker drones",phase:"pathways"});
  const answer={phase:"pathways",pathways:[{id:"p1",title:"Test design"}],blend:{title:"Test blend"}};
  const delivered=await get("/api/public/ascension/brain-worker",{
    method:"POST",headers:{...headers,"content-type":"application/json"},
    body:JSON.stringify({id:job.id,status:200,body:answer}),
  });
  assert.equal(delivered.status,200);
  const publicReply=await resultPromise;
  assert.equal(publicReply.status,200);
  assert.deepEqual(await publicReply.json(),answer,
    "The browser must receive the worker's answer, not a fabricated hosted result");
  // 3D is now routed to this same old-computer worker, never localhost
  // on the browser device or the former second computer.
  const statusPromise=get("/api/public/ascension/brain-3d/status");
  let statusJob=null;
  for(let i=0;i<30;i++){
    await sleep(100);
    statusJob=(await (await get("/api/public/ascension/brain-worker",{headers})).json()).job;
    if(statusJob)break;
  }
  assert.equal(statusJob.input.__brain_operation,"hunyuan_status");
  const statusReply={engine:"Hunyuan3D",ready:true,source:"owner-local"};
  const statusReport=await get("/api/public/ascension/brain-worker",{
    method:"POST",headers:{...headers,"content-type":"application/json"},
    body:JSON.stringify({id:statusJob.id,status:200,body:statusReply}),
  });
  assert.equal(statusReport.status,200);
  assert.deepEqual(await (await statusPromise).json(),statusReply);

  const reference="A".repeat(4800);
  const glb=Buffer.alloc(64,0);
  glb.write("glTF",0);
  const glbPromise=get("/api/public/ascension/brain-3d/generate",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({image:reference}),
  });
  let glbJob=null;
  for(let i=0;i<30;i++){
    await sleep(100);
    glbJob=(await (await get("/api/public/ascension/brain-worker",{headers})).json()).job;
    if(glbJob)break;
  }
  assert.equal(glbJob.input.__brain_operation,"hunyuan_generate");
  assert.equal(glbJob.input.image,reference);
  const glbReport=await get("/api/public/ascension/brain-worker",{
    method:"POST",headers:{...headers,"content-type":"application/json"},
    body:JSON.stringify({id:glbJob.id,status:200,body:{glb_base64:glb.toString("base64")}}),
  });
  assert.equal(glbReport.status,200);
  const binary=await glbPromise;
  assert.equal(binary.status,200);
  assert.equal(binary.headers.get("content-type"),"model/gltf-binary");
  assert.deepEqual(Buffer.from(await binary.arrayBuffer()),glb);

  // The new asynchronous pathway contract must not block a Railway HTTP
  // request while the older CPU runs, and must return exactly the worker reply.
  const asyncStart=await get("/api/public/ascension/independent",{
    method:"POST",headers:{"content-type":"application/json","prefer":"respond-async"},
    body:JSON.stringify({objective:"make worker drones",phase:"pathways"}),
  });
  assert.equal(asyncStart.status,202);
  const queued=await asyncStart.json();
  assert.match(queued.brain_job_id,/^[a-f0-9-]{36}$/);
  const pollingPath="/api/public/ascension/independent?brain_job="+queued.brain_job_id;
  const pending=await get(pollingPath);
  assert.equal(pending.status,202);

  let asyncJob=null;
  for(let i=0;i<30;i++){
    await sleep(100);
    asyncJob=(await (await get("/api/public/ascension/brain-worker",{headers})).json()).job;
    if(asyncJob)break;
  }
  assert.ok(asyncJob,"The older computer must claim the asynchronous pathway request");
  assert.deepEqual(asyncJob.input,{objective:"make worker drones",phase:"pathways"});
  const asyncAnswer={phase:"pathways",pathways:[
    {id:"p1",title:"First"}, {id:"p2",title:"Second"}, {id:"p3",title:"Third"},
  ],blend:{id:"blend",title:"Fourth"}};
  const ack=await get("/api/public/ascension/brain-worker",{
    method:"POST",headers:{...headers,"content-type":"application/json"},
    body:JSON.stringify({id:asyncJob.id,status:200,body:asyncAnswer}),
  });
  assert.equal(ack.status,200);
  const finished=await get(pollingPath);
  assert.equal(finished.status,200);
  assert.deepEqual(await finished.json(),asyncAnswer,
    "Polling must return the real local PC pathway data without fabrication");
  console.log("PASS LIVE Nitro async four-pathways relay, old-PC worker and progress polling.");
  console.log("PASS LIVE Nitro old-PC relay: ENGAGE and 3D transport, offline fails closed and no browser-local GPU dependency.");
} finally {
  runtime.kill("SIGTERM");
  await sleep(300);
  if(runtime.exitCode === null) runtime.kill("SIGKILL");
}
