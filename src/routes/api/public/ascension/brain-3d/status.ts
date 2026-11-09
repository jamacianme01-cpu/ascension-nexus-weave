import { createFileRoute } from "@tanstack/react-router";
import { isBrainOnline, remoteBrainEnabled, sendToBrain } from "@/lib/ascension/brain-relay.server";


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
    return json({error:"The designated old-PC 3D brain is not enabled."},503);
  }}}
});
