import { useEffect, type CSSProperties } from "react";
import "./designed-flow.css";

/** Screens taken from the designed flow, unchanged. */
export type DesignedScreen = "spiral" | "assembled" | "blueprint" | "dissect" | "exploded" | "imploded";
export type DesignedTarget = DesignedScreen | "book";

const FRAME = { width: 1280, height: 720 };

const PICTURE: Record<DesignedScreen, string> = {
  spiral: "/designed-flow/spiral.jpg",
  assembled: "/designed-flow/assembled.jpg",
  blueprint: "/designed-flow/blueprint.jpg",
  dissect: "/designed-flow/dissect.jpg",
  exploded: "/designed-flow/exploded.jpg",
  imploded: "/designed-flow/imploded.jpg",
};

export type PathwayReading = { title: string; line: string; blend?: boolean };

type Hit = { label: string; x: number; y: number; w: number; h: number; to: DesignedTarget; index?: number };

const CARD_BOXES: [number, number, number, number][] = [
  [125, 222, 246, 437],
  [386, 222, 244, 437],
  [645, 222, 236, 437],
  [897, 222, 253, 437],
];

function bar(
  x: number,
  y: number,
  width: number,
  height: number,
  cells: { label: string; to: DesignedTarget | null }[],
): Hit[] {
  const w = width / cells.length;
  const hits: Hit[] = [];
  cells.forEach((cell, index) => {
    if (!cell.to) return;
    hits.push({ label: cell.label, x: x + index * w, y, w, h: height, to: cell.to });
  });
  return hits;
}

function hitsFor(screen: DesignedScreen, readings: PathwayReading[]): Hit[] {
  const back: DesignedTarget = screen === "spiral" ? "book" : "spiral";
  const margin: Hit[] = [
    { label: "Back", x: 0, y: 0, w: 100, h: FRAME.height, to: back },
    { label: "Back", x: 1180, y: 0, w: 100, h: FRAME.height, to: back },
  ];
  if (screen === "spiral") {
    return [
      ...margin,
      ...CARD_BOXES.map(([x, y, w, h], index) => ({
        label: readings[index]?.title || `Pathway ${index + 1}`,
        x, y, w, h,
        to: "assembled" as const,
        index,
      })),
    ];
  }
  if (screen === "assembled") {
    return [
      ...margin,
      ...bar(105, 596, 1065, 120, [
        { label: "Assembled", to: "assembled" },
        { label: "Blueprint", to: "blueprint" },
        { label: "Dissect", to: "dissect" },
        { label: "Exploded", to: "exploded" },
        { label: "Imploded", to: "imploded" },
        { label: "Sound", to: null },
      ]),
    ];
  }
  if (screen === "blueprint") {
    return [
      ...margin,
      ...bar(105, 612, 1065, 66, [
        { label: "Overview", to: "assembled" },
        { label: "Architecture", to: null },
        { label: "Mobility", to: null },
        { label: "Systems", to: null },
        { label: "Payloads", to: null },
        { label: "Blueprint", to: "blueprint" },
      ]),
    ];
  }
  if (screen === "dissect") return margin;
  if (screen === "exploded") {
    return [
      ...margin,
      ...bar(115, 604, 1039, 68, [
        { label: "Overview", to: "assembled" },
        { label: "Assembly", to: null },
        { label: "Exploded", to: "exploded" },
        { label: "Connections", to: null },
        { label: "Specifications", to: null },
        { label: "Diagnostics", to: null },
      ]),
    ];
  }
  return [
    ...margin,
    { label: "Exploded", x: 118, y: 352, w: 190, h: 36, to: "exploded" },
    { label: "Imploded", x: 118, y: 388, w: 190, h: 36, to: "imploded" },
    { label: "Assembled", x: 118, y: 432, w: 190, h: 36, to: "assembled" },
    ...bar(296, 598, 848, 72, [
      { label: "Overview", to: "assembled" },
      { label: "Exploded", to: "exploded" },
      { label: "Imploded", to: "imploded" },
      { label: "Assembled", to: "assembled" },
      { label: "Animated", to: null },
    ]),
  ];
}

function place(hit: Hit): CSSProperties {
  return {
    left: `${(hit.x / FRAME.width) * 100}%`,
    top: `${(hit.y / FRAME.height) * 100}%`,
    width: `${(hit.w / FRAME.width) * 100}%`,
    height: `${(hit.h / FRAME.height) * 100}%`,
  };
}

export function DesignedFlow({
  screen,
  objective,
  readings,
  status,
  talking,
  onToggleTalking,
  onScreen,
  onOpen,
}: {
  screen: DesignedScreen;
  objective: string;
  readings: PathwayReading[];
  status: string;
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

  const back = screen === "spiral" ? "book" : "spiral";
  return (
    <div className="designed-screen">
      <button type="button" className="designed-tree-hear" aria-pressed={!talking} onClick={onToggleTalking}>
        {talking ? "MUTE TREE" : "HEAR TREE"}
      </button>
      <button type="button" className="designed-margin" aria-label="Back" onClick={() => onScreen(back)} />
      <div className="designed-frame" data-screen={screen}>
        <img src={PICTURE[screen]} alt={objective} draggable={false} />
        {screen === "spiral" && status && <p className="designed-status">{status}</p>}
        {screen === "spiral" && CARD_BOXES.map(([x, , w], index) => {
          const reading = readings[index];
          if (!reading) return null;
          return <div key={`${reading.line}-${index}`} className="designed-reading" style={{ left: `${((x + 8) / FRAME.width) * 100}%`, width: `${((w - 16) / FRAME.width) * 100}%` }}>
            <p className="designed-reading-name" aria-hidden="true" />
            <p className="designed-reading-picture">{objective}</p>
            <p className="designed-reading-line">{reading.line || reading.title}</p>
          </div>;
        })}
        {hitsFor(screen, readings).map((hit, index) => (
          <button
            key={`${hit.label}-${index}`}
            type="button"
            className="designed-hit"
            style={place(hit)}
            aria-label={hit.label}
            onClick={() => {
              if (hit.index !== undefined) onOpen(hit.index);
              else onScreen(hit.to);
            }}
          />
        ))}
      </div>
    </div>
  );
}
