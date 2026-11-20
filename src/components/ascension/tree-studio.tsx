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
};
export const TREE_DESIGN_VIEWS: DesignView[] = ["assembled", "blueprint", "dissect", "exploded", "imploded"];

export function TreeStudio({
  design, view, onView, onExplainPart, onContinue, loading = false,
}: {
  design: TreeDesign;
  view: DesignView;
  onView: (view: DesignView) => void;
  onExplainPart: (part: TreeDesign["parts"][number]) => void;
  onContinue: () => void;
  loading?: boolean;
}) {
  const [partsOpen, setPartsOpen] = useState(true);

  return <section className="tree-studio" aria-label="Live ASCENSION creation and inspection">
    <header className="tree-studio-heading">
      <h2>{design.title}</h2>
      <button type="button" onClick={onContinue} disabled={loading}>BUILD ON RESULT</button>
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
        <V1DesignViewport mode={view} modelUrl={design.modelUrl} imageUrl={design.imageUrl} blueprintUrl={design.blueprintUrl}/>
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
