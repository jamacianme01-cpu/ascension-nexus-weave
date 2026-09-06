import type { Relationship } from "@/lib/ascension/contracts";
import { Unavailable } from "./chrome";

/**
 * Luminous relationship field. Node positions are layout only; every node and
 * edge comes from world_model.json relationships (shared-ME resonance).
 */
export function ResonanceField({
  relationships,
  onSelect,
  selected,
}: {
  relationships?: Relationship[] | undefined;
  onSelect?: (id: string) => void | undefined;
  selected?: string | undefined;
}) {
  if (!relationships || relationships.length === 0) return <Unavailable label="relationships" />;

  const nodes = [...new Set(relationships.flatMap((r) => [r.a, r.b]))];
  const cx = 260;
  const cy = 150;
  const radius = nodes.length === 1 ? 0 : 108;
  const pos = new Map(
    nodes.map((id, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return [id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }] as const;
    }),
  );

  const maxShared = Math.max(1, ...relationships.map((r) => r.shared_mes?.length ?? 0));

  return (
    <div className="glass-inset rounded-md p-2">
      <svg viewBox="0 0 520 300" className="h-auto w-full" role="img" aria-label="Resonance field">
        <defs>
          <radialGradient id="coreGlow">
            <stop offset="0%" stopColor="oklch(0.9 0.14 196)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="oklch(0.9 0.14 196)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={132} fill="url(#coreGlow)" />
        {relationships.map((r) => {
          const a = pos.get(r.a)!;
          const b = pos.get(r.b)!;
          const weight = (r.shared_mes?.length ?? 0) / maxShared;
          return (
            <g key={`${r.a}-${r.b}-${r.kind ?? ""}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="oklch(0.86 0.14 196)"
                strokeOpacity={0.18 + weight * 0.4}
                strokeWidth={1 + weight * 2.5}
              />
              <line
                className="flowing-line"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="oklch(0.83 0.11 84)"
                strokeOpacity={0.7}
                strokeWidth={1}
              />
            </g>
          );
        })}
        {nodes.map((id) => {
          const p = pos.get(id)!;
          const active = selected === id;
          return (
            <g
              key={id}
              onClick={() => onSelect?.(id)}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={active ? 11 : 8}
                fill={active ? "oklch(0.86 0.14 196)" : "oklch(0.2 0.03 258)"}
                stroke={active ? "oklch(0.95 0.05 196)" : "oklch(0.83 0.11 84)"}
                strokeWidth={1.5}
              />
              <text
                x={p.x}
                y={p.y - 18}
                textAnchor="middle"
                className="fill-current font-mono text-[9px] text-muted-foreground"
              >
                {id.replace(/^DESTINY:/, "")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Lineage as a photonic spine of transition ids, in source order. */
export function LineageSpine({ lineage }: { lineage?: string[] | undefined }) {
  if (!lineage || lineage.length === 0) return <Unavailable label="lineage" />;
  return (
    <ol className="relative space-y-2 pl-5">
      <span className="absolute top-1 bottom-1 left-1.5 w-px bg-gradient-to-b from-primary/70 via-gold/50 to-transparent" />
      {lineage.map((id, i) => (
        <li key={id} className="relative">
          <span className="absolute top-2 -left-[14px] size-1.5 rounded-full bg-primary photon-glow" />
          <span className="font-mono text-[0.74rem] text-muted-foreground">
            <span className="text-gold/80">{String(i + 1).padStart(2, "0")}</span> {id}
          </span>
        </li>
      ))}
    </ol>
  );
}
