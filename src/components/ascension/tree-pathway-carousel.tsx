import { useState, type CSSProperties } from "react";

type Design = { id: string; title: string; summary: string };
export function TreePathwayCarousel({ designs, active, onRotate, onOpen }: {
  designs: Design[]; active: number; onRotate: (index: number) => void; onOpen: (index: number) => void;
}) {
  const [previewed, setPreviewed] = useState<number | null>(null);
  const focused = designs[previewed ?? active];
  const rotate = (direction: number) => onRotate((active + direction + designs.length) % designs.length);
  return <div className="tree-pathway-carousel" role="region" aria-roledescription="carousel"
    aria-label="Pathways around the Tree of Knowledge" tabIndex={0}
    onKeyDown={event => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const next = (active + (event.key === "ArrowRight" ? 1 : -1) + designs.length) % designs.length;
        const region = event.currentTarget;
        onRotate(next);
        window.requestAnimationFrame(() => region.querySelector<HTMLButtonElement>(`[data-design-index="${next}"]`)?.focus({ preventScroll: true }));
      }
    }}>
    <img className="tree-carousel-art" src="/approved-scene/ascension-tree-behind-book-hq.jpg"
      alt="The Tree of Knowledge rising above the open Book" draggable={false}/>
    <div className="tree-orbit-glow" aria-hidden="true" />
    <div className="tree-orbit-designs" role="tablist" aria-label="Choose a pathway">
      {designs.map((design, index) => {
        const slot = (index - active + designs.length) % designs.length;
        const position = [[32, 23], [68, 23], [73, 45], [27, 45]][slot % 4]!;
        const style = {
          "--orbit-x": `${position[0]}%`,
          "--orbit-y": `${position[1]}%`,
          "--orbit-scale": index === active ? 1.08 : 1,
          zIndex: index === active ? 3 : 2,
        } as CSSProperties;
        return <button type="button" key={design.id} role="tab" aria-selected={index === active}
          aria-label={`Hear about ${design.title}`} className="tree-orbit-card" data-active={index === active} data-blend={index === designs.length - 1}
          data-design-index={index} tabIndex={index === active ? 0 : -1}
          style={style} onClick={() => onOpen(index)}
          onPointerEnter={() => setPreviewed(index)} onPointerLeave={() => setPreviewed(null)}
          onFocus={() => setPreviewed(index)} onBlur={() => setPreviewed(null)}>
          <span className="tree-orb-window">
            <span className="tree-orb-title">{design.title}</span>
          </span>
          <span className="tree-orb-glass" aria-hidden="true" />
          {index === designs.length - 1 && <span className="tree-orbit-blend">BLEND</span>}
        </button>;
      })}
    </div>
    <div className="tree-orb-reading" aria-live="polite" aria-atomic="true">
      <strong>{focused?.title}</strong>
      <span>Select an orb to hear this possibility</span>
    </div>
    <div className="tree-carousel-navigation">
      <button type="button" onClick={() => rotate(-1)} aria-label="Previous pathway">←</button>
      <div aria-live="polite" aria-atomic="true">{designs[active]?.title}</div>
      <button type="button" onClick={() => rotate(1)} aria-label="Next pathway">→</button>
    </div>
  </div>;
}
