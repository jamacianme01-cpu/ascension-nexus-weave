import type { CSSProperties } from "react";

type Design = { id: string; title: string; summary: string; image?: string | undefined };
export function TreePathwayCarousel({ designs, active, onRotate, onOpen }: {
  designs: Design[]; active: number; onRotate: (index: number) => void; onOpen: (index: number) => void;
}) {
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
        const angle = (45 + slot * 90) * Math.PI / 180;
        const style = {
          "--orbit-x": `${50 + Math.sin(angle) * 37}%`,
          "--orbit-y": `${52 + Math.cos(angle) * 24}%`,
          "--orbit-scale": Math.cos(angle) > 0 ? 1 : .83,
          zIndex: Math.cos(angle) > 0 ? 3 : 2,
        } as CSSProperties;
        return <button type="button" key={design.id} role="tab" aria-selected={index === active}
          aria-label={`Open ${design.title}`} className="tree-orbit-card" data-active={index === active}
          data-design-index={index} tabIndex={index === active ? 0 : -1}
          style={style} onClick={() => onOpen(index)}>
          {index === designs.length - 1 && <span className="tree-orbit-blend">BLEND</span>}
          {design.image && <img src={design.image} alt={`${design.title} design preview`} />}
          <strong>{design.title}</strong>
          <span className="tree-orbit-summary">{design.summary}</span>
          <span className="tree-orbit-open">Explore this design ↗</span>
        </button>;
      })}
    </div>
    <div className="tree-carousel-navigation">
      <button type="button" onClick={() => rotate(-1)} aria-label="Previous pathway">←</button>
      <div aria-live="polite" aria-atomic="true">{designs[active]?.title}</div>
      <button type="button" onClick={() => rotate(1)} aria-label="Next pathway">→</button>
    </div>
  </div>;
}
