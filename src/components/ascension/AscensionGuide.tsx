import { useMemo, useState } from "react";
import type { ObjectiveDelivery, ObjectivePathway } from "@/lib/ascension/result-model";

type GuideProps = {
  objective: string;
  status: string | null;
  delivery: ObjectiveDelivery | null;
  selectedId: string | null;
  onInspect: (path: ObjectivePathway) => void;
  onBuild: () => void;
  disabled?: boolean;
};

/** V1 contextual guide. Only describes real delivered pathways; no synthesized claims. */
export function AscensionGuide({objective,status,delivery,selectedId,onInspect,onBuild,disabled}:GuideProps){
  const [expanded,setExpanded]=useState(false);
  const paths=useMemo(()=>delivery?[...delivery.pathways,...(delivery.blend?[delivery.blend]:[])]:[],[delivery]);
  const selected=paths.find(p=>p.id===selectedId)||null;
  const running=status==="queued"||status==="claimed"||status==="running";
  const finished=status==="verified"||status==="failed"||status==="rejected";
  const voice=selected
    ? `You're exploring ${selected.label}. I'll keep its explanation separate from the image, and you can return to the other pathways whenever you want.`
    : paths.length>=2
      ? `I've got ${delivery?.pathways.length} different directions to explore${delivery?.blend?" and a Blend":""}. Choose the one that fits your goal; you don't have to take the recommended path.`
      : paths.length===1
        ? "There is one delivered direction so far. I won't pretend the others exist. You can inspect it or continue working on your objective."
        : running
          ? "I'm following your objective through the engines now. I'll show you what was actually produced and explain any limits."
          : finished
            ? "This run hasn't delivered usable pathways. I'll show you the actual outcome instead of presenting a blocked result as a finished invention."
            : "Tell me what you want to accomplish. I'll help you compare the possible directions and build on the one you choose.";
  return <section className="ascension-guide mx-auto max-w-6xl rounded-2xl border border-gold/35 bg-void/90 p-4 shadow-xl sm:p-5"
    aria-label="ASCENSION guide" aria-live="polite">
    <div className="flex flex-wrap items-start gap-3 sm:gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/55 bg-gold/10 font-display text-xl text-gold" aria-hidden="true">A</div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <strong className="font-display text-lg text-gold">ASCENSION · Your guide</strong>
          <span className="text-xs text-muted-foreground">{running?"Working on your objective":paths.length?"Explore your pathways":"Here to help"}</span>
        </div>
        <p className="text-sm leading-6 text-foreground/90">{voice}</p>
        {objective&&<p className="mt-2 text-xs text-muted-foreground">Your objective: {objective}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {paths.map((path,index)=><button key={path.id} type="button" disabled={disabled}
            className="min-h-10 rounded-lg border border-primary/35 bg-primary/5 px-3 text-xs text-foreground hover:border-gold/50"
            onClick={()=>onInspect(path)}>{path.id===selectedId?"Viewing · ":"Explore · "}{index===3?"Blend":path.label}</button>)}
          {paths.length>0&&<button type="button" disabled={disabled}
            onClick={onBuild} className="min-h-10 rounded-lg border border-gold/45 px-3 text-xs text-gold">
            Build on this result</button>}
          {paths.length>1&&<button type="button" onClick={()=>setExpanded(v=>!v)}
            className="min-h-10 rounded-lg border border-border px-3 text-xs text-muted-foreground">
            {expanded?"Hide comparison":"Help me compare"}
          </button>}
        </div>
        {expanded&&<div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Compare delivered pathways">
          {paths.map(path=><button key={path.id} type="button" onClick={()=>onInspect(path)}
            className="rounded-lg border border-primary/20 bg-background/30 p-3 text-left">
            <strong className="block text-sm text-gold">{path.label}</strong>
            <span className="mt-1 block text-xs leading-5 text-foreground/85">{path.summary||"No explanation was provided by the engine."}</span>
            {path.tradeoffs.length>0&&<span className="mt-1 block text-xs text-muted-foreground">Tradeoff: {path.tradeoffs[0]}</span>}
          </button>)}
        </div>}
        <p className="mt-2 text-xs text-muted-foreground">Design suggestions and confidence are not physical verification. Shared knowledge remains private until approved.</p>
      </div>
    </div>
  </section>;
}
