import { useEffect, useState } from "react";
import { TreeGuide } from "@/components/ascension/tree-guide";
import { V1ModelWorkbench, type V1Component, type V1PhysicalMode } from "@/components/ascension/v1-model-workbench";

type Part = { name: string; purpose: string; location: string };
type Pathway = { id: string; title: string; summary: string; steps: string[]; tradeoffs: string[]; parts: Part[]; blend_reason?: string };
export function V1ModeledPathway({
  path,objective,kind,onSpeak,speakingEnabled,
}:{
  path:Pathway; objective:string; kind:"linear"|"rover"|"multirotor";
  onSpeak:(value:string)=>void; speakingEnabled:boolean;
}) {
  const [mode,setMode]=useState<V1PhysicalMode>("assembled");
  const [components,setComponents]=useState<V1Component[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [panel,setPanel]=useState<"description"|"labels">("description");
  const [zoom,setZoom]=useState(1);
  const [rotation,setRotation]=useState(0);
  const [reset,setReset]=useState(0);
  const [full,setFull]=useState(false);
  const [error,setError]=useState("");
  const [edit,setEdit]=useState<{id:number;name:string;action:"left"|"right"|"up"|"down"|"hide"|"restore"}>();
  const applyEdit=(action:"left"|"right"|"up"|"down"|"hide"|"restore")=>{
    if(selected&&components.some(p=>p.name===selected))
      setEdit(previous=>({id:(previous?.id??0)+1,name:selected,action}));
  };
  useEffect(()=>{
    if(!full)return;
    const original=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const handle=(event:KeyboardEvent)=>{if(event.key==="Escape")setFull(false);};
    document.addEventListener("keydown",handle);
    return()=>{document.body.style.overflow=original;document.removeEventListener("keydown",handle);};
  },[full]);
  const inspect=(name:string)=>{
    setSelected(name);
    setPanel("labels");
    const physical=components.find(p=>p.name===name);
    const authored=path.parts.find(p=>{
      const a=p.name.toLowerCase(),b=name.toLowerCase();
      return a===b||a.includes(b)||b.includes(a);
    });
    if(authored)onSpeak(authored.name+". "+authored.purpose+". "+authored.location);
    else if(physical)onSpeak(physical.name+". "+physical.role);
  };
  const current=components.find(p=>p.name===selected);
  const attached=path.parts.find(p=>{
    if(!selected)return false;
    const a=p.name.toLowerCase(),b=selected.toLowerCase();
    return a===b||a.includes(b)||b.includes(a);
  });
  const view=(next:V1PhysicalMode)=>setMode(next);
  return <section className="rounded-2xl border border-gold/35 bg-[#04101cf5] p-4 shadow-2xl sm:p-6"
    aria-label="Single canonical invention design">
    <h3 className="mb-2 text-xl text-gold">{path.title}</h3>
    <TreeGuide objective={objective} pathway={path} enabled={speakingEnabled} onSpeak={onSpeak}/>
    <p className="mb-4 text-sm leading-6 text-foreground/90">{path.summary}</p>
    <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="One model three views">
      {(["assembled","blueprint","dissect"] as V1PhysicalMode[]).map(v=><button key={v}
        type="button" aria-pressed={mode===v} onClick={()=>view(v)}
        className={"rounded-xl border px-4 py-3 text-sm "+(mode===v
          ?"border-primary bg-primary/25 text-primary":"border-gold/35 text-gold")}>
        {v==="assembled"?"ASSEMBLED":v==="blueprint"?"BLUEPRINT":"DISSECT / EXPLODE"}
      </button>)}
      {mode==="dissect"&&<button type="button" onClick={()=>view("assembled")}
        className="rounded-xl border border-gold/40 px-4 py-3 text-sm text-gold">
        IMPLODE / REASSEMBLE
      </button>}
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,0.85fr)]">
      <div className={full
        ?"fixed inset-0 z-[200] flex flex-col bg-[#030d18] p-3 sm:p-6"
        :"flex min-w-0 flex-col gap-3"}>
        {full&&<div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="truncate text-gold">{path.title} · {mode.toUpperCase()}</h4>
          <button type="button" onClick={()=>setFull(false)}
            className="rounded-lg border border-gold/50 px-4 py-2 text-gold">CLOSE REALITY VIEW</button>
        </div>}
        <div className={"relative min-w-0 flex-1 overflow-hidden rounded-xl border border-gold/20 bg-[#061420] "+
          (full?"min-h-0":"h-[min(66vh,610px)] min-h-[400px]")}
          aria-label="Selected invention model">
          <V1ModelWorkbench kind={kind} mode={mode} title={path.title}
            zoom={zoom} rotation={rotation} reset={reset}
            selected={selected} edit={edit} onParts={setComponents} onSelect={inspect} onError={setError}/>
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-[#031320cf] px-3 py-2 text-xs text-cyan-100">
            {mode==="assembled"?"ASSEMBLED · SAME COMPONENTS":mode==="blueprint"
              ?"ORTHOGRAPHIC · SAME COMPONENTS":"EXPLODED · SAME COMPONENTS"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="3D model controls">
          <button type="button" className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold" onClick={()=>setZoom(v=>Math.min(4,v*1.25))}>ZOOM IN</button>
          <button type="button" className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold" onClick={()=>setZoom(v=>Math.max(.45,v/1.25))}>ZOOM OUT</button>
          <button type="button" className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold" onClick={()=>setRotation(v=>v-15)}>ROTATE LEFT</button>
          <button type="button" className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold" onClick={()=>setRotation(v=>v+15)}>ROTATE RIGHT</button>
          <button type="button" className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold" onClick={()=>{setZoom(1);setRotation(0);setSelected(null);setReset(n=>n+1);}}>RESET</button>
          {!full&&<button type="button" onClick={()=>setFull(true)}
            className="rounded-lg border border-primary/60 px-4 py-2 text-sm text-primary">DIVE INTO REALITY</button>}
        </div>
        {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
        <p className="text-xs text-foreground/70">
          Same 3D concept assembly in every view. Component positions are relative, not manufactured measurements.
          {mode==="blueprint"?" Dimensions and tolerances: not specified.":""}
          {mode==="dissect"?" Explosion distances are for inspection, not an assembly instruction.":""}
        </p>
      </div>
      <aside className="min-w-0 rounded-xl border border-gold/25 bg-[#08192a] p-4" aria-label="Pathway inspection">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["description","labels"] as const).map(tab=><button type="button" key={tab}
            aria-pressed={panel===tab} onClick={()=>setPanel(tab)}
            className={"rounded-lg border px-3 py-2 text-sm "+(panel===tab?"border-primary text-primary":"border-gold/40 text-gold")}>
            {tab.toUpperCase()}
          </button>)}
        </div>
        {panel==="description"?<div className="space-y-4 text-sm leading-6">
          {path.blend_reason&&<p className="border-l-2 border-primary pl-3">{path.blend_reason}</p>}
          <h4 className="font-semibold text-gold">HOW IT WORKS</h4>
          <ol className="list-decimal space-y-2 pl-5">{path.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>
          {path.tradeoffs.length>0&&<details><summary className="cursor-pointer text-gold">Engineering limits</summary>
            <ul className="list-disc pl-4">{path.tradeoffs.map((text,i)=><li key={i}>{text}</li>)}</ul>
          </details>}
        </div>:<div className="space-y-2" aria-label="Selectable components">
          <p className="text-xs text-foreground/60">Select a named component or click it in the 3D view.</p>
          {components.map((component,i)=><button key={i} type="button" onClick={()=>inspect(component.name)}
            aria-pressed={component.name===selected}
            className={"block w-full rounded-lg border p-3 text-left text-sm "+(component.name===selected
              ?"border-primary bg-primary/15":"border-gold/30")}>{component.name}</button>)}
          {selected&&<div className="mt-3 rounded-xl border border-primary/35 p-3 text-sm" aria-live="polite">
            <strong className="text-gold">{selected}</strong>
            <p className="mt-2"><b>WHAT:</b> {attached?.name||current?.name}</p>
            <p className="mt-2"><b>WHERE:</b> {attached?.location||"Relative position shown in the model; no measured coordinates."}</p>
            <p className="mt-2"><b>DOES:</b> {attached?.purpose||current?.role}</p>
          </div>}
          {selected&&components.some(p=>p.name===selected)&&<div className="mt-3 border-t border-gold/25 pt-3">
            <h4 className="mb-2 text-xs text-gold">MOVE SELECTED COMPONENT · CONCEPT UNITS</h4>
            <div className="grid grid-cols-2 gap-2">
              {(["left","right","up","down"] as const).map(action=><button type="button"
                key={action} onClick={()=>applyEdit(action)}
                className="rounded-lg border border-gold/35 px-3 py-2 text-xs text-gold">
                MOVE {action.toUpperCase()}
              </button>)}
              <button type="button" onClick={()=>applyEdit("hide")}
                className="rounded-lg border border-gold/35 px-3 py-2 text-xs text-gold">HIDE PART</button>
              <button type="button" onClick={()=>applyEdit("restore")}
                className="rounded-lg border border-gold/35 px-3 py-2 text-xs text-gold">RESTORE PART</button>
            </div>
          </div>}
          {path.parts.length>0&&<details className="mt-3 text-sm">
            <summary className="cursor-pointer text-gold">Other pathway-described components</summary>
            {path.parts.map((p,i)=><button key={i} type="button" onClick={()=>{
                setSelected(p.name);onSpeak(p.name+". "+p.purpose+". "+p.location);
              }} className="mt-2 block w-full rounded-md border border-gold/30 p-2 text-left">
              {p.name}</button>)}
          </details>}
        </div>}
      </aside>
    </div>
  </section>;
}
