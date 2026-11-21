import { type CSSProperties } from "react";
import { V1DesignViewport, type DesignView } from "./v1-design-viewport";
import type { CrystalSummary } from "@/lib/ascension/intent-crystals.functions";
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
  crystals: CrystalSummary[];
  selectedId: string | null;
  onRecall: (id: string) => void;
}) {
  const hasVisualization = Boolean(design?.modelUrl || design?.imageUrl || design?.blueprintUrl);
  return <div className="ascension-crystals" aria-label="Living intent crystals">
    <div className="ascension-tree-intents" aria-label="Saved intentions on the Tree">
      {crystals.slice(0, 24).map((crystal, index) => (
        <button type="button" key={crystal.id}
          className="ascension-tree-crystal"
          data-active={crystal.id === selectedId}
          data-verified={crystal.verifiedRevision !== null}
          title={crystal.intent}
          aria-label={`Recall intent: ${crystal.intent}`}
          style={{
            "--intent-x": `${12 + ((index * 37) % 80)}%`,
            "--intent-y": `${8 + ((index * 23) % 43)}%`,
            "--intent-delay": `${(index % 7) * -0.47}s`,
          } as CSSProperties}
          onClick={() => onRecall(crystal.id)}>
          <span className="ascension-crystal-facet" aria-hidden="true"/>
        </button>
      ))}
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
