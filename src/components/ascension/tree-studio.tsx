import { useState } from "react";
import { V1DesignViewport, type DesignView } from "./v1-design-viewport";
import "./tree-studio.css";

export type TreeDesign = {
  title: string;
  summary: string;
  imageUrl: string | null;
  blueprintUrl: string | null;
  modelUrl: string | null;
  parts: { name: string; location: string; purpose: string }[];
  files?: { name: string; content: string }[];
};
export const TREE_DESIGN_VIEWS: DesignView[] = ["assembled", "blueprint", "dissect", "exploded", "imploded"];

export function TreeStudio({
  design, view, onView, onExplainPart, onContinue, onBack, rotateRequest = 0, zoomRequest = 0, loading = false,
}: {
  design: TreeDesign;
  view: DesignView;
  onView: (view: DesignView) => void;
  onExplainPart: (part: TreeDesign["parts"][number]) => void;
  onContinue: () => void;
  onBack?: () => void;
  loading?: boolean;
  rotateRequest?: number;
  zoomRequest?: number;
}) {
  const [partsOpen, setPartsOpen] = useState(true);
  function downloadOriginalArtifact(file: {name: string; content: string}) {
    // User-initiated download of actual governed source bytes, never generated
    // by the front end and never rendered as executable HTML.
    const uri = URL.createObjectURL(new Blob([file.content], {type:"text/plain;charset=utf-8"}));
    const anchor = document.createElement("a");
    anchor.href = uri;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(uri), 1000);
  }

  return <section className="tree-studio" aria-label="Live ASCENSION creation and inspection">
    <header className="tree-studio-heading">
      <h2>{design.title}</h2>
      <div className="tree-studio-actions">
        {onBack && <button type="button" onClick={onBack} disabled={loading}>FOUR PATHWAYS</button>}
        <button type="button" onClick={onContinue} disabled={loading}>BUILD ON RESULT</button>
      </div>
    </header>
    <div className="tree-studio-summary">{design.summary}</div>
    <nav className="tree-studio-views" aria-label="Inspect the same invention">
      {TREE_DESIGN_VIEWS.map(item => (
        <button type="button" key={item} aria-current={item === view ? "page" : undefined}
          onClick={() => onView(item)}>{item === "assembled" ? "Assembled" : item === "exploded" ? "Explode" : item === "imploded" ? "Implode" : item[0]!.toUpperCase()+item.slice(1)}</button>
      ))}
    </nav>
    <div className="tree-studio-work">
      <div className="tree-studio-viewport">
        {design.modelUrl || design.imageUrl || design.blueprintUrl
          ? <V1DesignViewport mode={view} modelUrl={design.modelUrl} imageUrl={design.imageUrl}
            blueprintUrl={design.blueprintUrl} rotateRequest={rotateRequest} zoomRequest={zoomRequest}/>
          : <article className="tree-studio-readable" aria-label="Actual governed result">
              <p>{design.summary}</p>
              {design.files?.length ? <div className="tree-studio-files">
                <h3>Original delivered files</h3>
                {design.files.map(file => <button key={file.name} type="button"
                  onClick={() => downloadOriginalArtifact(file)}>{file.name}</button>)}
              </div> : null}
              <p className="tree-studio-no-geometry">No measured 3D model or blueprint has been delivered for this result.</p>
            </article>}
      </div>
      <aside className="tree-studio-parts" aria-label="Invention components">
        <button className="tree-studio-parts-toggle" type="button" aria-expanded={partsOpen}
          onClick={() => setPartsOpen(v => !v)}>Components {partsOpen ? "−" : "+"}</button>
        {partsOpen && (design.parts.length ? <ul>{design.parts.map((part,index) => <li key={part.name+index}>
          <button type="button" onClick={() => onExplainPart(part)}>{part.name}</button>
          {part.purpose && <p><strong>Does:</strong> {part.purpose}</p>}
          {part.location && <p><strong>Where:</strong> {part.location}</p>}
        </li>)}</ul> : <p>The governed engine has not supplied component specifications.</p>)}
      </aside>
    </div>
  </section>;
}
