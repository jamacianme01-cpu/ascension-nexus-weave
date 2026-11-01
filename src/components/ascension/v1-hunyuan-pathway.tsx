import { useEffect, useRef, useState } from "react";
import { TreeGuide } from "@/components/ascension/tree-guide";
import { V1HunyuanWorkbench, type MeshPart, type HunyuanMode } from "@/components/ascension/v1-hunyuan-workbench";

type Part={name:string;purpose:string;location:string};
type Pathway={
  id:string;title:string;summary:string;steps:string[];tradeoffs:string[];
  parts:Part[];blend_reason?:string;
};
type Cache={current:Map<string,ArrayBuffer>};
const LOCAL="http://127.0.0.1:8082";
const validImage=/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]{4000,12000000})$/i;
function formatError(reason:unknown){
  return reason instanceof Error?reason.message:String(reason);
}

export function V1HunyuanPathway({
  path,objective,onSpeak,speakingEnabled,modelCache,imageCache,
}:{
  path:Pathway;objective:string;onSpeak:(text:string)=>void; speakingEnabled:boolean;modelCache:Cache;
  imageCache:{current:Map<string,string>};
}) {
  const key=JSON.stringify([objective,path.id,path.title,path.summary]);
  const [bytes,setBytes]=useState<ArrayBuffer|null>(null);
  const [picture,setPicture]=useState<string|null>(null);
  const [working,setWorking]=useState(false);
  const [status,setStatus]=useState("Checking for the owner's local Hunyuan3D generator…");
  const [failure,setFailure]=useState("");
  const [attempt,setAttempt]=useState(0);
  const [mode,setMode]=useState<HunyuanMode>("assembled");
  const [parts,setParts]=useState<MeshPart[]>([]);
  const [meshIndex,setMeshIndex]=useState<number|null>(null);
  const [tab,setTab]=useState<"description"|"labels">("description");
  const [zoom,setZoom]=useState(1);
  const [rotation,setRotation]=useState(0);
  const [reset,setReset]=useState(0);
  const [move,setMove]=useState<{seq:number;index:number;delta:[number,number,number]}>();
  const [immersive,setImmersive]=useState(false);
  const [generatorError,setGeneratorError]=useState("");

  useEffect(()=>{
    setMode("assembled");setMeshIndex(null);setTab("description");
    setZoom(1);setRotation(0);setReset(0);setParts([]);setImmersive(false);
  },[path.id]);
  useEffect(()=>{
    const stored=modelCache.current.get(key);
    if(stored){setBytes(stored);setFailure("");setWorking(false);setStatus("Hunyuan3D mesh ready");return;}
    let active=true;
    const controller=new AbortController();
    setBytes(null);setPicture(imageCache.current.get(key)??null);setFailure("");setWorking(true);setParts([]);
    (async()=>{
      // Show the already-approved selected pathway picture even when the owner's
      // Windows-only Hunyuan3D bridge cannot be reached from this browser.
      let sourceImage=imageCache.current.get(key);
      if(!sourceImage) {
        setStatus("Preparing this selected pathway's reference picture…");
        const response=await fetch("/api/public/ascension/independent",{
          method:"POST",signal:controller.signal,
          headers:{"content-type":"application/json"},
          body:JSON.stringify({objective,phase:"picture",view:"assembled",pathway:path}),
        });
        const source=await response.json() as {image_url?:string;error?:string};
        if(!response.ok)throw new Error(source.error||"Reference picture generation failed");
        sourceImage=source.image_url;
        if(!sourceImage?.match(validImage))throw new Error("ASCENSION did not return a usable selected invention picture.");
        if(!active)return;
        imageCache.current.set(key,sourceImage);
        setPicture(sourceImage);
      }
      const match=sourceImage.match(validImage);
      if(!match)throw new Error("The saved selected invention picture is invalid.");
      setStatus("Checking the owner's Hunyuan3D engine on this computer…");
      let ready:Response;
      try{
        ready=await fetch(LOCAL+"/status",{signal:controller.signal,cache:"no-store"});
      }catch{
        throw new Error("Hunyuan3D is not connected to this browser. The invention picture remains available; real 3D requires the Windows local bridge.");
      }
      if(!ready.ok)throw new Error("Hunyuan3D is not ready on the Windows PC (port 8082).");
      const condition=await ready.json() as {ready?:boolean;engine?:string};
      if(!condition.ready||condition.engine!=="Hunyuan3D")
        throw new Error("The local bridge is not connected to Hunyuan3D.");
      setStatus("Hunyuan3D is creating one real 3D GLB for this pathway. All views will reuse it.");
      const generated=await fetch(LOCAL+"/generate",{
        method:"POST",signal:controller.signal,headers:{"content-type":"application/json"},
        body:JSON.stringify({image:match[1]}),
      });
      if(!generated.ok){
        let reason="";
        try{const error=await generated.json() as {error?:string};reason=error.error||"";}catch{}
        throw new Error(reason||"Local Hunyuan3D returned HTTP "+generated.status);
      }
      const output=await generated.arrayBuffer();
      if(output.byteLength<20||output.byteLength>60*1024*1024||
        new TextDecoder().decode(output.slice(0,4))!=="glTF")
        throw new Error("Hunyuan3D did not return a valid GLB. A fabricated model is not allowed.");
      if(!active)return;
      modelCache.current.set(key,output);
      setBytes(output);setStatus("Real Hunyuan3D model ready");setFailure("");
    })().catch(e=>{
      if(!active||controller.signal.aborted)return;
      setFailure(formatError(e));setStatus("Hunyuan3D unavailable");
    }).finally(()=>{if(active)setWorking(false);});
    return()=>{active=false;controller.abort();};
  },[key,attempt,modelCache,imageCache]);

  useEffect(()=>{
    if(!immersive)return;
    const overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setImmersive(false);};
    window.addEventListener("keydown",escape);
    return()=>{document.body.style.overflow=overflow;window.removeEventListener("keydown",escape);};
  },[immersive]);

  const changeView=(next:HunyuanMode)=>{setMode(next);};
  const inspect=(index:number)=>{
    setMeshIndex(index);setTab("labels");
    const mesh=parts[index];
    if(mesh)onSpeak(mesh.name+". This is an actual submesh returned by Hunyuan3D. Its physical function cannot be inferred reliably from geometry alone.");
  };
  const moveMesh=(delta:[number,number,number])=>{
    if(meshIndex!==null)setMove(prev=>({seq:(prev?.seq??0)+1,index:meshIndex,delta}));
  };
  const buttons=<div role="group" aria-label="Actual Hunyuan model controls"
    className="flex flex-wrap gap-2">
    <button type="button" onClick={()=>setZoom(v=>Math.min(5,v*1.25))}
      className="rounded-lg border border-gold/40 px-3 py-2 text-xs text-gold">ZOOM IN</button>
    <button type="button" onClick={()=>setZoom(v=>Math.max(.5,v/1.25))}
      className="rounded-lg border border-gold/40 px-3 py-2 text-xs text-gold">ZOOM OUT</button>
    <button type="button" onClick={()=>setRotation(v=>v-15)}
      className="rounded-lg border border-gold/40 px-3 py-2 text-xs text-gold">ROTATE LEFT</button>
    <button type="button" onClick={()=>setRotation(v=>v+15)}
      className="rounded-lg border border-gold/40 px-3 py-2 text-xs text-gold">ROTATE RIGHT</button>
    <button type="button" onClick={()=>{setZoom(1);setRotation(0);setReset(v=>v+1);}}
      className="rounded-lg border border-gold/40 px-3 py-2 text-xs text-gold">RESET</button>
  </div>;
  return <section className="rounded-2xl border border-gold/30 bg-[#04101cf5] p-4 sm:p-6"
    aria-label="Selected Hunyuan 3D pathway">
    <h3 className="mb-2 text-xl text-gold">{path.title}</h3>
    <TreeGuide objective={objective} pathway={path} enabled={speakingEnabled} onSpeak={onSpeak}/>
    <p className="mb-4 max-w-4xl text-sm leading-6">{path.summary}</p>
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Design views from the same Hunyuan mesh">
      {(["assembled","blueprint","dissect"] as HunyuanMode[]).map(v=><button
        key={v} type="button" aria-pressed={mode===v} disabled={!bytes||(v==="dissect"&&parts.length<2)}
        onClick={()=>changeView(v)}
        className={"rounded-lg border px-4 py-2 text-sm disabled:opacity-40 "+
          (mode===v?"border-primary bg-primary/20 text-primary":"border-gold/40 text-gold")}>
        {v==="assembled"?"ASSEMBLED":v==="blueprint"?"BLUEPRINT":"DISSECT / EXPLODE"}
      </button>)}
      {mode==="dissect"&&<button type="button"
        className="rounded-lg border border-gold/40 px-4 py-2 text-sm text-gold"
        onClick={()=>changeView("assembled")}>IMPLODE / REASSEMBLE</button>}
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.85fr)]">
      <div className={immersive?"fixed inset-0 z-[200] flex flex-col bg-[#030d18] p-4":"flex min-w-0 flex-col gap-3"}>
        {immersive&&<div className="mb-2 flex items-center justify-between">
          <h4 className="truncate text-gold">{path.title} · HUNYUAN3D</h4>
          <button type="button" onClick={()=>setImmersive(false)}
            className="rounded-lg border border-gold/40 px-4 py-2 text-gold">CLOSE REALITY VIEW</button>
        </div>}
        <div className={"relative min-w-0 overflow-hidden rounded-xl border border-gold/25 bg-[#051727] "+
          (immersive?"flex-1 min-h-0":"h-[min(65vh,600px)] min-h-[360px]")}
          aria-label="Hunyuan3D real mesh viewer">
          {bytes?<V1HunyuanWorkbench
            bytes={bytes} title={path.title} mode={mode} zoom={zoom}
            rotation={rotation} selected={meshIndex} move={move}
            reset={reset} onParts={setParts} onError={setGeneratorError} onSelect={inspect}/>:
            picture?<div className="flex h-full min-h-0 flex-col gap-2 p-3">
              <img src={picture} alt={`Concept picture of ${path.title}`}
                className="min-h-0 flex-1 w-full rounded-lg object-contain" />
              <div role={failure?"alert":"status"} className="flex flex-wrap items-center justify-center gap-3 text-center text-xs text-gold">
                <span>{working?status:failure||status}</span>
                {failure&&<button type="button" className="rounded-lg border border-gold/50 px-3 py-2"
                  onClick={()=>setAttempt(v=>v+1)}>RECONNECT HUNYUAN3D</button>}
              </div>
            </div>:
            <div role={failure?"alert":"status"} className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="max-w-xl text-sm text-gold">{working?status:failure||status}</p>
              {failure&&<button type="button" className="rounded-lg border border-gold/50 px-4 py-2 text-gold"
                onClick={()=>setAttempt(v=>v+1)}>RECONNECT HUNYUAN3D</button>}
            </div>}
          {mode==="blueprint"&&bytes&&<div aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-3 grid grid-cols-3 text-center text-xs text-cyan-200">
            <span>TOP</span><span>FRONT</span><span>SIDE</span>
          </div>}
        </div>
        {generatorError&&<p role="alert" className="text-xs text-red-300">{generatorError}</p>}
        {bytes&&buttons}
        {bytes&&!immersive&&<button type="button" onClick={()=>setImmersive(true)}
          className="self-start rounded-xl border border-primary/60 px-4 py-2 text-sm text-primary">
          DIVE INTO REALITY
        </button>}
        <p className="text-xs text-foreground/70">
          {bytes?"Actual Hunyuan3D GLB. All views use the same mesh; dimensions are not calibrated."
            :"Waiting for Hunyuan3D. No procedural or unrelated model is substituted."}
          {mode==="dissect"&&parts.length<2?" The generator returned a fused mesh that cannot honestly be dissected.":""}
        </p>
      </div>
      {!immersive&&<aside className="min-w-0 rounded-xl border border-gold/25 bg-[#08192a] p-4"
        aria-label="Hunyuan design description and parts">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["description","labels"] as const).map(v=><button key={v} type="button"
            aria-pressed={tab===v} onClick={()=>setTab(v)}
            className={"rounded-lg border px-3 py-2 text-sm "+
              (tab===v?"border-primary text-primary":"border-gold/40 text-gold")}>
            {v.toUpperCase()}
          </button>)}
        </div>
        {tab==="description"?<div className="space-y-4 text-sm leading-6">
          {path.blend_reason&&<p className="border-l-2 border-primary pl-3">{path.blend_reason}</p>}
          <p>{path.summary}</p>
          <h4 className="font-semibold text-gold">HOW IT WORKS</h4>
          <ol className="list-decimal space-y-2 pl-5">
            {path.steps.map((step,i)=><li key={i}>{step}</li>)}
          </ol>
          {path.tradeoffs.length>0&&<details>
            <summary className="cursor-pointer text-gold">Engineering limits</summary>
            <ul className="list-disc pl-5">{path.tradeoffs.map((t,i)=><li key={i}>{t}</li>)}</ul>
          </details>}
        </div>:<div className="space-y-2 text-sm">
          <p className="text-xs text-foreground/65">Actual Hunyuan mesh elements ({parts.length}). Mesh names are not automatically engineering component identifications.</p>
          {parts.map(p=><button type="button" key={p.meshIndex}
            onClick={()=>inspect(p.meshIndex)} aria-pressed={meshIndex===p.meshIndex}
            className={"block w-full rounded-lg border p-3 text-left "+
              (meshIndex===p.meshIndex?"border-primary":"border-gold/30")}>{p.name}</button>)}
          {meshIndex!==null&&<div className="mt-3 space-y-2 rounded-lg border border-primary/35 p-3">
            <strong>{parts[meshIndex]?.name}</strong>
            <p>WHAT: Hunyuan-generated submesh. WHERE: Positioned within the displayed 3D assembly.</p>
            <p>DOES: Functional assignment is not established by the mesh alone.</p>
            <div className="grid grid-cols-2 gap-2">
              {([["LEFT",[-.15,0,0]],["RIGHT",[.15,0,0]],["UP",[0,.15,0]],["DOWN",[0,-.15,0]]] as [string,[number,number,number]][]).map(([label,delta])=>
                <button key={label} type="button" onClick={()=>moveMesh(delta)}
                  className="rounded-md border border-gold/40 p-2 text-xs text-gold">MOVE {label}</button>)}
            </div>
          </div>}
          {path.parts.length>0&&<details className="mt-4">
            <summary className="cursor-pointer text-gold">Pathway-described components (not yet mapped to Hunyuan geometry)</summary>
            {path.parts.map((p,i)=><div className="mt-2 rounded-lg border border-gold/20 p-3" key={i}>
              <strong>{p.name}</strong><p>WHAT / DOES: {p.purpose}</p><p>WHERE: {p.location}</p>
            </div>)}
          </details>}
        </div>}
      </aside>}
    </div>
  </section>;
}
