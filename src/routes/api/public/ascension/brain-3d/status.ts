import { createFileRoute } from "@tanstack/react-router";
import { isBrainOnline, remoteBrainEnabled, sendToBrain } from "@/lib/ascension/brain-relay.server";
import { localBrainConfigured } from "@/lib/ascension/engine/local-answer.server";

function json(body: unknown, status=200): Response {
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
}

/** V1 3D readiness belongs to the designated brain PC, never the viewer's device. */
export const Route = createFileRoute("/api/public/ascension/brain-3d/status")({
  server:{handlers:{GET:async()=>{
    if(remoteBrainEnabled()){
      if(!isBrainOnline())return json({error:"The older ASCENSION computer is not connected."},503);
      const reply=await sendToBrain({__brain_operation:"hunyuan_status"});
      return json(reply.body,reply.status);
    }
    if(!localBrainConfigured())return json({error:"The designated local 3D brain is not configured."},503);
    try{
      const response=await fetch("http://127.0.0.1:8082/status",{
        headers:{"origin":"http://127.0.0.1:8080"},signal:AbortSignal.timeout(5000),cache:"no-store",
      });
      const body=await response.json();
      return json(body,response.status);
    }catch{return json({error:"Hunyuan3D is not running on the designated brain PC."},503);}
  }}}
});
