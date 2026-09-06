import { cn } from "@/lib/utils";
import type { Branch, Delta } from "@/lib/ascension/contracts";
import { Pill, Unavailable } from "./chrome";

/** Canonical engine names. Never renamed, never invented values. */
export type EngineSignal = {
  name: "Analyzer" | "Akashic" | "Projector" | "Outcome Predictor" | "Confidence Engine" | "Guardian";
  /** Published reading, or undefined when the contracts do not expose runtime activity. */
  reading?: string | undefined;
  source: string;
};

/**
 * Six engines charging the Destiny Crystal. Positions are layout only; each
 * orb's reading comes from published state or is explicitly unavailable.
 */
export function EngineRing({ engines }: { engines: EngineSignal[] }) {
  const cx = 300;
  const cy = 190;
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-void/50">
      <svg viewBox="0 0 600 380" className="h-auto w-full" role="img" aria-label="Six engine field">
        <defs>
          <radialGradient id="crystalCore">
            <stop offset="0%" stopColor="oklch(0.98 0.05 196)" stopOpacity="0.95" />
            <stop offset="55%" stopColor="oklch(0.86 0.14 196)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="oklch(0.86 0.14 196)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="facet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.96 0.06 200)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="oklch(0.55 0.12 220)" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        <ellipse cx={cx} cy={330} rx={250} ry={26} fill="oklch(0.83 0.11 84)" opacity="0.08" />
        <circle cx={cx} cy={cy} r={160} fill="url(#crystalCore)" opacity="0.5" />

        {engines.map((engine, i) => {
          const angle = (i / engines.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * 215;
          const y = cy + Math.sin(angle) * 118;
          const live = Boolean(engine.reading);
          return (
            <g key={engine.name}>
              <path
                d={`M ${x} ${y} Q ${(x + cx) / 2} ${(y + cy) / 2 - 26} ${cx} ${cy}`}
                fill="none"
                stroke="oklch(0.86 0.14 196)"
                strokeOpacity={live ? 0.55 : 0.18}
                strokeWidth={live ? 2 : 1}
              />
              <path
                className="flowing-line"
                d={`M ${x} ${y} Q ${(x + cx) / 2} ${(y + cy) / 2 - 26} ${cx} ${cy}`}
                fill="none"
                stroke="oklch(0.83 0.11 84)"
                strokeOpacity={live ? 0.8 : 0.25}
                strokeWidth={1}
              />
              <circle cx={x} cy={y} r={26} fill="oklch(0.86 0.14 196)" opacity={live ? 0.14 : 0.05} />
              <circle
                cx={x}
                cy={y}
                r={13}
                fill="oklch(0.2 0.03 258)"
                stroke={live ? "oklch(0.86 0.14 196)" : "oklch(0.62 0.08 76)"}
                strokeWidth={1.6}
              />
              <circle cx={x} cy={y} r={4} fill={live ? "oklch(0.95 0.08 196)" : "oklch(0.62 0.08 76)"} />
              <text
                x={x}
                y={y + 34}
                textAnchor="middle"
                fill="oklch(0.9 0.02 220)"
                className="font-mono"
                style={{ fontSize: 11, letterSpacing: "0.12em" }}
              >
                {engine.name.toUpperCase()}
              </text>
              <text
                x={x}
                y={y + 48}
                textAnchor="middle"
                fill={live ? "oklch(0.86 0.14 196)" : "oklch(0.62 0.026 226)"}
                className="font-mono"
                style={{ fontSize: 10 }}
              >
                {engine.reading ?? "unavailable"}
              </text>
            </g>
          );
        })}

        {/* Destiny Crystal nexus */}
        <g>
          <path
            d={`M ${cx} ${cy - 74} L ${cx + 34} ${cy - 6} L ${cx} ${cy + 82} L ${cx - 34} ${cy - 6} Z`}
            fill="url(#facet)"
            stroke="oklch(0.95 0.05 196)"
            strokeWidth="1.2"
          />
          <path
            d={`M ${cx} ${cy - 74} L ${cx} ${cy + 82} M ${cx - 34} ${cy - 6} L ${cx + 34} ${cy - 6}`}
            stroke="oklch(0.98 0.04 200)"
            strokeOpacity="0.6"
            strokeWidth="0.8"
          />
          <ellipse cx={cx} cy={cy + 96} rx={56} ry={10} fill="oklch(0.86 0.14 196)" opacity="0.22" />
        </g>
      </svg>
      <p className="border-t border-border/50 px-4 py-2 font-mono text-[0.6rem] tracking-[0.2em] text-muted-foreground uppercase">
        Engines charge · Destiny Crystal integrates · Tree distributes
      </p>
    </div>
  );
}

/** Tree / chromosome glyph: crystal package received, developed, emerged. */
export function TreeGlyph({
  meCount,
  relationships,
  emergence,
  lineageDepth,
}: {
  meCount?: number | undefined;
  relationships?: number | undefined;
  emergence?: number | undefined;
  lineageDepth?: number | undefined;
}) {
  const branches = Math.max(3, Math.min(9, relationships ?? 3));
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-void/50">
      <svg viewBox="0 0 600 300" className="h-auto w-full" role="img" aria-label="Tree of knowledge state">
        <line
          x1="300"
          y1="290"
          x2="300"
          y2="120"
          stroke="oklch(0.83 0.11 84)"
          strokeOpacity="0.7"
          strokeWidth="4"
        />
        {Array.from({ length: branches }).map((_, i) => {
          const spread = ((i + 0.5) / branches) * Math.PI;
          const x = 300 - Math.cos(spread) * 250;
          const y = 120 - Math.sin(spread) * 92;
          return (
            <g key={i}>
              <path
                d={`M 300 150 Q ${(300 + x) / 2} ${y + 40} ${x} ${y}`}
                fill="none"
                stroke="oklch(0.86 0.14 196)"
                strokeOpacity="0.45"
                strokeWidth="1.6"
              />
              <path
                className="flowing-line"
                d={`M 300 150 Q ${(300 + x) / 2} ${y + 40} ${x} ${y}`}
                fill="none"
                stroke="oklch(0.95 0.06 200)"
                strokeOpacity="0.7"
                strokeWidth="1"
              />
              <circle cx={x} cy={y} r="5" fill="oklch(0.9 0.12 196)" opacity="0.9" />
              <circle cx={x} cy={y} r="12" fill="oklch(0.86 0.14 196)" opacity="0.12" />
            </g>
          );
        })}
        {Array.from({ length: Math.max(0, Math.min(6, lineageDepth ?? 0)) }).map((_, i) => (
          <circle
            key={i}
            cx={300}
            cy={280 - i * 26}
            r={3}
            fill="oklch(0.83 0.11 84)"
            opacity={0.5 + i * 0.08}
          />
        ))}
      </svg>
      <div className="grid grid-cols-2 gap-px border-t border-border/50 sm:grid-cols-4">
        {[
          ["Meaning Elements", meCount],
          ["Relationships", relationships],
          ["Emergence candidates", emergence],
          ["Lineage depth", lineageDepth],
        ].map(([label, value]) => (
          <div key={String(label)} className="px-3 py-2">
            <p className="label-eyebrow">{String(label)}</p>
            <p className="mt-1 font-mono text-sm text-primary">
              {value === undefined ? <Unavailable /> : String(value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** DTF / Transverse: pathways visibly branch from one origin. */
export function BranchFan({
  branches,
  executedId,
  recommendedId,
  onSelect,
  selected,
}: {
  branches: Branch[];
  executedId?: string | undefined;
  recommendedId?: string | undefined;
  onSelect?: ((id: string) => void) | undefined;
  selected?: string | undefined;
}) {
  if (branches.length === 0) return <Unavailable label="branches" />;
  const originX = 70;
  const originY = 150;
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-void/50">
      <svg viewBox="0 0 600 300" className="h-auto w-full" role="img" aria-label="DTF branch fan">
        <circle cx={originX} cy={originY} r="34" fill="oklch(0.86 0.14 196)" opacity="0.12" />
        <circle
          cx={originX}
          cy={originY}
          r="11"
          fill="oklch(0.2 0.03 258)"
          stroke="oklch(0.95 0.05 196)"
          strokeWidth="1.6"
        />
        <text
          x={originX}
          y={originY + 52}
          textAnchor="middle"
          fill="oklch(0.9 0.02 220)"
          className="font-mono"
          style={{ fontSize: 10, letterSpacing: "0.16em" }}
        >
          ORIGIN
        </text>
        {branches.map((b, i) => {
          const y = 40 + (i * 220) / Math.max(1, branches.length - 1 || 1);
          const executed = b.branch_id === executedId;
          const recommended = b.branch_id === recommendedId;
          const strong = executed || recommended;
          const active = selected === b.branch_id;
          const conf = b.evaluation?.outcome_predictor ?? b.confidence ?? 0;
          return (
            <g
              key={b.branch_id}
              onClick={() => onSelect?.(b.branch_id)}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              <path
                d={`M ${originX} ${originY} C 220 ${originY} 300 ${y} 470 ${y}`}
                fill="none"
                stroke={executed ? "oklch(0.86 0.14 196)" : "oklch(0.83 0.11 84)"}
                strokeOpacity={active ? 0.95 : strong ? 0.65 : 0.28}
                strokeWidth={active ? 3 : strong ? 2.2 : 1.2}
              />
              {strong && (
                <path
                  className="flowing-line"
                  d={`M ${originX} ${originY} C 220 ${originY} 300 ${y} 470 ${y}`}
                  fill="none"
                  stroke="oklch(0.98 0.05 200)"
                  strokeOpacity="0.75"
                  strokeWidth="1"
                />
              )}
              <circle
                cx={470}
                cy={y}
                r={executed ? 8 : 6}
                fill={executed ? "oklch(0.9 0.12 196)" : "oklch(0.2 0.03 258)"}
                stroke="oklch(0.83 0.11 84)"
                strokeWidth="1.4"
              />
              <text
                x={488}
                y={y - 3}
                fill="oklch(0.9 0.02 220)"
                className="font-mono"
                style={{ fontSize: 10, letterSpacing: "0.08em" }}
              >
                {(b.approach ?? b.branch_id).slice(0, 14)}
              </text>
              <text
                x={488}
                y={y + 11}
                fill="oklch(0.86 0.14 196)"
                className="font-mono"
                style={{ fontSize: 9 }}
              >
                {conf ? conf.toFixed(3) : "unavailable"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Verified Δ as accepted evolution: proposed → verified → persisted lineage. */
export function DeltaEvolution({
  proposed,
  accepted,
  total,
  persisted,
  verification,
}: {
  proposed?: Delta | undefined;
  accepted?: Delta | undefined;
  total?: Delta | undefined;
  persisted?: boolean | undefined;
  verification?: string | undefined;
}) {
  const stages: { label: string; tone: string; delta?: Delta | undefined; note: string }[] = [
    { label: "Proposed Δ", tone: "border-gold/40 text-gold", delta: proposed, note: "simulated" },
    {
      label: "Verified Δ",
      tone: "border-primary/50 text-primary",
      delta: accepted,
      note: verification ?? "verification unavailable",
    },
    {
      label: "Persisted lineage Δ",
      tone: "border-violet-flux/45 text-violet-flux",
      delta: total,
      note: persisted === undefined ? "persistence unavailable" : persisted ? "persisted" : "not persisted",
    },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {stages.map((stage, i) => (
        <div key={stage.label} className="relative">
          {i > 0 && (
            <span className="pointer-events-none absolute top-1/2 -left-2.5 hidden font-mono text-xs text-primary md:block">
              →
            </span>
          )}
          <div className={cn("glass-inset rounded-md border px-3 py-3", stage.tone)}>
            <p className="font-mono text-[0.62rem] tracking-[0.22em] uppercase">{stage.label}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              {stage.delta ? (
                (["K", "U", "W"] as const).map((k) => (
                  <span key={k} className="font-display text-xl text-foreground">
                    Δ{k} <span className="font-mono text-base text-primary">{stage.delta![k]}</span>
                  </span>
                ))
              ) : (
                <Unavailable />
              )}
            </div>
            <p className="mt-2 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
              {stage.note}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FlowLegend({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((step, i) => (
        <span key={step} className="flex items-center gap-2">
          {i > 0 && <span className="font-mono text-[0.7rem] text-gold/70">→</span>}
          <Pill tone={i === steps.length - 1 ? "photon" : "neutral"}>{step}</Pill>
        </span>
      ))}
    </div>
  );
}
