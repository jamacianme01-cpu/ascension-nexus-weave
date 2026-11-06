import { createFileRoute } from "@tanstack/react-router";
import { remoteBrainEnabled, sendToBrain } from "@/lib/ascension/brain-relay.server";
import { localBrainConfigured } from "@/lib/ascension/engine/local-answer.server";

function json(body: unknown,status=200):Response {
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
}
function glb(bytes: Uint8Array): Response {
  if(bytes.length<20||bytes.length>9_000_000||
     new TextDecoder().decode(bytes.slice(0,4))!=="glTF")
    return json({error:"The older PC did not produce a bounded valid GLB."},502);
  return new Response(Buffer.from(bytes),{status:200,headers:{
    "content-type":"model/gltf-binary","cache-control":"no-store",
    "x-content-type-options":"nosniff",
  }});
}

/** Only the older PC may execute 3D generation. Cloud is a byte transport. */
export const Route = createFileRoute("/api/public/ascension/brain-3d/generate")({
  server:{handlers:{POST:async({request})=>{
    const origin=request.headers.get("origin");
    const host=(request.headers.get("x-forwarded-host")||request.headers.get("host")||
      new URL(request.url).host).split(",")[0]!.trim();
    if(request.headers.get("sec-fetch-site")==="cross-site"||
       (origin&&new URL(origin).host!==host))
      return json({error:"Cross-site 3D requests are forbidden."},403);
    const raw=await request.text();
    if(raw.length>12_100_000)return json({error:"3D reference exceeds the size limit."},413);
    let input:unknown;
    try{input=JSON.parse(raw);}catch{return json({error:"Invalid 3D request."},400);}
    const image=(input&&typeof input==="object"&&!Array.isArray(input)?
      (input as Record<string,unknown>)["image"]:null);
    if(typeof image!=="string"||image.length<4000||image.length>12_000_000||
       !/^[A-Za-z0-9+/=]+$/.test(image))
      return json({error:"Invalid bounded 3D reference image."},400);

    if(remoteBrainEnabled()){
      const reply=await sendToBrain({__brain_operation:"hunyuan_generate",image});
      if(reply.status!==200)return json(reply.body,reply.status);
      const encoded=(reply.body&&typeof reply.body==="object"&&!Array.isArray(reply.body)?
        (reply.body as Record<string,unknown>)["glb_base64"]:null);
      if(typeof encoded!=="string"||encoded.length>12_000_000||
         !/^[A-Za-z0-9+/=]+$/.test(encoded))
        return json({error:"The older PC returned no valid 3D asset."},502);
      return glb(Buffer.from(encoded,"base64"));
    }
    if(!localBrainConfigured())return json({error:"Hunyuan3D is not connected to the designated computer."},503);
    try{
      const response=await fetch("http://127.0.0.1:8082/generate",{
        method:"POST",headers:{"origin":"http://127.0.0.1:8080","content-type":"application/json"},
        body:JSON.stringify({image}),signal:AbortSignal.timeout(100_000),
      });
      if(!response.ok){
        const message=(await response.text()).slice(0,300);
        return json({error:"Old-PC Hunyuan3D returned HTTP "+response.status+": "+message},502);
      }
      return glb(new Uint8Array(await response.arrayBuffer()));
    }catch(cause){
      return json({error:"Old-PC Hunyuan3D is unavailable: "+(cause instanceof Error?cause.message:String(cause)).slice(0,180)},503);
    }
  }}}
});
