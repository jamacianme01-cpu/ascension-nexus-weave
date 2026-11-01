import { useState } from "react";
import "./spiral-flow.css";

export type FlowPart = { name: string; purpose: string; location: string };
export type FlowPathway = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  parts: FlowPart[];
  blend_reason?: string;
  imageUrl?: string;
};

export const PATH_STYLES = [
  { name: "ChatGPT", tone: "MODULAR · PRECISE · ADAPTIVE" },
  { name: "Claude", tone: "CONTEMPLATIVE · STRUCTURED · RELIABLE" },
  { name: "Grok", tone: "BOLD · EXPLORATORY · UNFILTERED" },
  { name: "BLEND", tone: "SYNTHESIZED · BALANCED · VERSATILE" },
] as const;

type FlowView = "assembled" | "blueprint" | "dissect" | "exploded" | "imploded" | "sound";

const VIEWS: { id: FlowView; label: string }[] = [
  { id: "assembled", label: "ASSEMBLED" },
  { id: "blueprint", label: "BLUEPRINT" },
  { id: "dissect", label: "DISSECT" },
  { id: "exploded", label: "EXPLODED" },
  { id: "imploded", label: "IMPLODED" },
  { id: "sound", label: "SOUND" },
];

function InventionPicture({ src, view, title }: { src?: string; view: FlowView; title: string }) {
  if (!src) return <div className="flow-picture" data-view={view} />;
  return <img className="flow-picture" data-view={view} src={src} alt={title} />;
}

export function SpiralBoard({
  pathways,
  talking,
  onOpen,
  onReset,
  onToggleTalking,
}: {
  pathways: FlowPathway[];
  talking: boolean;
  onOpen: (index: number) => void;
  onReset: () => void;
  onToggleTalking: () => void;
}) {
  return <section className="flow-spiral" aria-label="Spiral pathways">
    <p className="flow-kicker">SPIRAL PATHWAYS</p>
    <div className="flow-mark" aria-hidden="true" />
    <h2>3 DISTINCT PATHS + BLEND</h2>
    <div className="flow-tools">
      <button type="button" onClick={onToggleTalking}>{talking ? "Quiet the tree" : "Hear the tree"}</button>
      <button type="button" onClick={onReset}>New objective</button>
    </div>
    <div className="flow-grid">
      {pathways.map((path, index) => {
        const style = PATH_STYLES[index] ?? PATH_STYLES[0];
        return <button type="button" key={path.id} className="flow-card" onClick={() => onOpen(index)}>
          <span className="flow-num">{index + 1}</span>
          <span className="flow-name">{style.name}</span>
          <span className="flow-gem" aria-hidden="true" />
          <InventionPicture src={path.imageUrl} view="assembled" title={path.title} />
          <span className="flow-tone">{style.tone}</span>
        </button>;
      })}
    </div>
  </section>;
}

function viewLine(view: FlowView, path: FlowPathway, part: FlowPart | undefined) {
  if (view === "sound") {
    if (part) return `${part.name}. ${part.purpose}`;
    return path.summary || path.title;
  }
  if (view === "blueprint") return "The blueprint is the same invention, as a drawing.";
  if (view === "dissect") return "The same invention, opened so the parts can be seen.";
  if (view === "exploded") return "The same invention, with the parts set apart.";
  if (view === "imploded") return "The parts can come back together.";
  return `${path.title}. This is one way it might come together.`;
}

export function PathwayStage({
  pathway,
  variant,
  talking,
  onClose,
  onGuide,
}: {
  pathway: FlowPathway;
  variant: number;
  talking: boolean;
  onClose: () => void;
  onGuide: (text: string) => void;
}) {
  const style = PATH_STYLES[variant] ?? PATH_STYLES[0];
  const [view, setView] = useState<FlowView>("assembled");
  const [selected, setSelected] = useState<number | null>(null);
  const part = selected === null ? undefined : pathway.parts[selected];
  function show(next: FlowView) {
    setView(next);
    onGuide(viewLine(next, pathway, next === "sound" ? part ?? pathway.parts[0] : part));
  }
  return <section className="flow-stage" aria-label={`${pathway.title} views`} data-view={view}>
    <button type="button" className="flow-back" onClick={onClose}>← BACK TO PATHWAYS</button>
    <aside className="flow-identity">
      <p>ASCENSION</p>
      <span>PATHWAY SELECTED</span>
      <strong>{style.name}</strong>
      <h2>{pathway.title}</h2>
    </aside>
    <div className="flow-canvas">
      <p className="flow-view-name">{view === "assembled" || view === "imploded" || view === "sound" ? "OVERVIEW" : view.toUpperCase()}</p>
      <InventionPicture src={pathway.imageUrl} view={view} title={pathway.title} />
      {talking && <p className="flow-guide" role="status">{viewLine(view, pathway, part)}</p>}
    </div>
    <aside className="flow-components" aria-label="Components">
      <p>COMPONENTS</p>
      {pathway.parts.map((item, index) => <button type="button" key={item.name + index} aria-pressed={selected === index} onClick={() => {
        setSelected(index);
        onGuide(`${item.name}. ${item.purpose}`);
      }}>
        <strong>{item.name}</strong>
        <span>{item.purpose}</span>
      </button>)}
    </aside>
    <div className="flow-views" role="group" aria-label="Views">
      {VIEWS.map((item) => <button type="button" key={item.id} aria-pressed={view === item.id} onClick={() => show(item.id)}>
        {item.label}
      </button>)}
    </div>
  </section>;
}
