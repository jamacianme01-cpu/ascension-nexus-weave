import { useEffect } from "react";
import "./designed-flow.css";

/** Screens from the designed flow. The picture is a reading of the user's words. */
export type DesignedScreen = "spiral" | "assembled" | "blueprint" | "dissect" | "exploded" | "imploded";
export type DesignedTarget = DesignedScreen | "book";

export type DesignPart = { name: string; purpose: string; location: string };
export type PathwayReading = {
  title: string;
  line: string;
  blend?: boolean;
  parts: DesignPart[];
};

const VIEWS: { label: string; to: DesignedScreen }[] = [
  { label: "Assembled", to: "assembled" },
  { label: "Blueprint", to: "blueprint" },
  { label: "Dissect", to: "dissect" },
  { label: "Exploded", to: "exploded" },
  { label: "Imploded", to: "imploded" },
];

function partsOf(readings: PathwayReading[], index: number): DesignPart[] {
  const parts = readings[index]?.parts ?? [];
  return parts.filter(part => part.name.trim()).slice(0, 8);
}

function DesignPicture({
  screen,
  objective,
  reading,
  parts,
}: {
  screen: DesignedScreen;
  objective: string;
  reading: PathwayReading | undefined;
  parts: DesignPart[];
}) {
  const title = reading?.title || "This reading";
  const spread = screen === "exploded" || screen === "dissect";
  const lines = screen === "blueprint" || screen === "dissect";
  return (
    <figure className={`design-picture design-picture-${screen}`} aria-label={`${title}. ${objective}`}>
      <figcaption>
        <span>Your words</span>
        <strong>{objective}</strong>
      </figcaption>
      <div className={spread ? "design-parts design-parts-spread" : "design-parts"}>
        <p className={lines ? "design-subject design-subject-line" : "design-subject"}>{title}</p>
        {parts.length === 0 && <p className="design-part-name">{reading?.line || "The reading stays on your sentence."}</p>}
        {parts.map(part => (
          <div key={part.name} className="design-part">
            <p className="design-part-name">{part.name}</p>
            {part.location && <p className="design-part-where">Where: {part.location}</p>}
            {part.purpose && <p className="design-part-why">{part.purpose}</p>}
          </div>
        ))}
      </div>
      <p className="design-picture-note">A design reading of your sentence. Not a photograph and not a verified build.</p>
    </figure>
  );
}

export function DesignedFlow({
  screen,
  objective,
  readings,
  choice,
  talking,
  onToggleTalking,
  onScreen,
  onOpen,
}: {
  screen: DesignedScreen;
  objective: string;
  readings: PathwayReading[];
  choice: number;
  talking: boolean;
  onToggleTalking: () => void;
  onScreen: (next: DesignedTarget) => void;
  onOpen: (index: number) => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      onScreen(screen === "spiral" ? "book" : "spiral");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onScreen, screen]);

  const selected = readings[choice] ?? readings[0];
  const parts = partsOf(readings, screen === "spiral" ? 0 : choice);
  const back = screen === "spiral" ? "book" : "spiral";

  return (
    <div className="designed-screen">
      <button type="button" className="designed-tree-hear" aria-pressed={!talking} onClick={onToggleTalking}>
        {talking ? "MUTE TREE" : "HEAR TREE"}
      </button>
      <section className="design-board" aria-label="Your design">
        <button type="button" className="design-back" onClick={() => onScreen(back)}>Back</button>
        <DesignPicture screen={screen === "spiral" ? "assembled" : screen} objective={objective} reading={selected} parts={parts} />
        {screen === "spiral" ? (
          <div className="design-cards">
            {readings.map((reading, index) => (
              <button key={`${reading.title}-${index}`} type="button" className="design-card" onClick={() => onOpen(index)}>
                <span>{reading.blend ? "Blend" : `Path ${index + 1}`}</span>
                <strong>{reading.title}</strong>
                <em>{reading.line}</em>
              </button>
            ))}
          </div>
        ) : (
          <div className="design-views" role="toolbar" aria-label="Views of this reading">
            {VIEWS.map(view => (
              <button key={view.to} type="button" aria-pressed={screen === view.to} onClick={() => onScreen(view.to)}>
                {view.label}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
