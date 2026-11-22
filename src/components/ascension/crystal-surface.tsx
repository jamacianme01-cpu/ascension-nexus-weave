import { type CSSProperties } from "react";
import { V1DesignViewport, type DesignView } from "./v1-design-viewport";
import type { CrystalSummary } from "@/lib/ascension/intent-crystals.functions";
type VisualCrystal = CrystalSummary & { drafts?: readonly {status: string}[] };
import "./crystal-surface.css";

export type CrystalDesign = {
  title: string;
  summary: string;
  imageUrl: string | null;
  blueprintUrl: string | null;
  modelUrl: string | null;
};

export function CrystalSurface({
  working, design, view, rotateRequest, zoomRequest, crystals, selectedId, onRecall,
}: {
  working: boolean;
  design: CrystalDesign | null;
  view: DesignView;
  rotateRequest: number;
  zoomRequest: number;
  crystals: VisualCrystal[];
  selectedId: string | null;
  onRecall: (id: string) => void;
}) {
  const hasVisualization = Boolean(design?.modelUrl || design?.imageUrl || design?.blueprintUrl);
  return <div className="ascension-crystals" aria-label="Living intent crystals">
    <div className="ascension-tree-intents" aria-label="Saved intentions on the Tree">
      {crystals.slice(0, 24).map((crystal, index) => { const drafts = crystal.drafts?.length ?? 0; return (
        <button type="button" key={crystal.id}
          className="ascension-tree-crystal"
          data-active={crystal.id === selectedId}
          data-verified={crystal.verifiedRevision !== null}
          data-drafts={drafts > 0}
          title={crystal.intent}
          aria-label={`Recall intent: ${crystal.intent}. ${drafts} unverified device drafts recorded`}
          style={{
            "--intent-x": `${49 + ((index * 37) % 42)}%`,
            "--intent-y": `${8 + ((index * 23) % 43)}%`,
            "--intent-delay": `${(index % 7) * -0.47}s`,
            "--intent-growth": `${1 + Math.min(0.6, crystal.verifiedGrowthCount * 0.09) + Math.min(0.28, drafts * 0.035)}`,
          } as CSSProperties}
          onClick={() => onRecall(crystal.id)}>
          <span className="ascension-crystal-facet" aria-hidden="true"/>
        </button>
      ); })}
    </div>
    {(working || design) && <div className="ascension-held-crystal"
      data-phase={working ? "descending" : "revealed"}
      role="status" aria-label={working ? "The Tree is working on your intent" : "Intent crystal in the groundskeeper's hand"}>
      <span className="ascension-held-crystal-shell" aria-hidden="true"/>
      <span className="ascension-held-crystal-heart" aria-hidden="true"/>
    </div>}
    {design && hasVisualization && <section className="ascension-crystal-reality"
      aria-label={`Knowledge revealed for ${design.title}`}>
      <V1DesignViewport modelUrl={design.modelUrl} imageUrl={design.imageUrl}
        blueprintUrl={design.blueprintUrl} mode={view}
        rotateRequest={rotateRequest} zoomRequest={zoomRequest}/>
    </section>}
    {design && !hasVisualization && <span className="sr-only">
      The governed knowledge is available to hear. No measured model or picture was delivered for this intent.
    </span>}
  </div>;
}
