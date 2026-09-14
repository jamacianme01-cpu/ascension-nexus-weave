import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { surfaceQuery } from "@/lib/ascension/state";
import { knowledgeWorld, type KnowledgeWorld, type WorldNode } from "@/lib/ascension/world-model";
import { strings } from "@/lib/ascension/result-model";
import { cn } from "@/lib/utils";

function Value({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground/90">{value ?? "Not published"}</dd>
    </div>
  );
}
function Traits({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.length ? (
          values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="max-w-full break-words rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-foreground/85"
            >
              {v}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">None recorded</span>
        )}
      </div>
    </div>
  );
}

function EntityCard({ node }: { node: WorldNode }) {
  const [tab, setTab] = useState("Identity");
  return (
    <aside
      aria-label="Library Card"
      className="glass-inset space-y-5 rounded-xl border border-gold/25 p-5"
    >
      <div>
        <p className="label-eyebrow text-gold">Library Card</p>
        <h3 className="mt-2 font-display text-lg capitalize text-foreground">{node.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {node.what ?? "Published identity"}
        </p>
      </div>
      <div className="flex gap-1 border-b border-border" aria-label="Card sections">
        {["Identity", "Development", "Memory"].map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "min-h-11 flex-1 px-1 text-xs",
              tab === t ? "border-b border-primary text-primary" : "text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Identity" && (
        <div className="space-y-5">
          <dl className="space-y-4">
            <Value label="Who" value={node.who} />
            <Value label="What" value={node.what} />
            <Value label="Why · current purpose" value={node.why} />
            <Value label="Persistent ID · continuity" value={node.persistentId} />
            <Value label="Current SID · embodiment" value={node.sid} />
          </dl>
          <Traits label="Active Meaning Elements" values={node.mes} />
        </div>
      )}
      {tab === "Development" && (
        <div className="space-y-5">
          <dl className="space-y-4">
            <Value label="Genesis" value={node.genesis} />
            <Value
              label="Chromosome"
              value={
                typeof node.chromosome["chromosome_id"] === "string"
                  ? node.chromosome["chromosome_id"]
                  : null
              }
            />
            <Value label="Developmental state" value={node.state?.toLowerCase() ?? null} />
          </dl>
          <Traits
            label="Starting identity elements"
            values={strings(node.chromosome["identity_elements"])}
          />
          <Traits label="Expressed traits" values={node.traits} />
          <Traits label="Inherited traits" values={node.inherited} />
          <Traits label="Newly emerged traits" values={node.emerged} />
          <Traits label="Constraints" values={node.constraints} />
          <Traits label="Environment" values={node.environment} />
        </div>
      )}
      {tab === "Memory" && (
        <div className="space-y-4">
          <p className="text-sm text-gold">
            Verified Δ · K {node.delta.K ?? "—"} · W {node.delta.W ?? "—"} · U {node.delta.U ?? "—"}
          </p>
          <Traits label="Ancestry" values={node.ancestry} />
          <p className="text-xs text-muted-foreground">
            {node.events.length} recorded lineage events
          </p>
          <ol className="space-y-3 border-l border-primary/20 pl-4">
            {node.events
              .slice(-6)
              .reverse()
              .map((event, i) => (
                <li key={`${event.transition}-${i}`} className="space-y-1 text-xs">
                  <p className="text-primary">
                    {event.at ? new Date(event.at).toLocaleString() : "Recorded transition"}
                  </p>
                  <p className="break-all text-muted-foreground">{event.transition}</p>
                  {event.delta && <p className="break-all text-gold/80">{event.delta}</p>}
                </li>
              ))}
          </ol>
        </div>
      )}
    </aside>
  );
}

function FormationSequence({ world }: { world: KnowledgeWorld }) {
  const meaningCount = new Set(world.nodes.flatMap((node) => node.mes)).size;
  const lineageCount = world.nodes.reduce((total, node) => total + node.events.length, 0);
  const stages = [
    { label: "Meaning received", value: meaningCount, active: meaningCount > 0 },
    { label: "Relationships formed", value: world.edges.length, active: world.edges.length > 0 },
    { label: "Knowledge took form", value: world.nodes.length, active: world.nodes.length > 0 },
    { label: "Emergence", value: world.emergences.length, active: world.emergences.length > 0 },
    { label: "Verified evolution", value: lineageCount, active: lineageCount > 0 },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-void/50 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="label-eyebrow text-primary">KNOWLEDGE FORMATION</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Published meaning becoming relationships, forms, emergence, and retained evolution.
          </p>
        </div>
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-primary shadow-[0_0_18px_rgba(80,228,221,.9)]" />
      </div>
      <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-5">
        <div aria-hidden="true" className="absolute left-[8%] right-[8%] top-5 hidden h-px bg-gradient-to-r from-primary/10 via-primary/80 to-gold/50 sm:block" />
        {stages.map((stage, index) => (
          <div key={stage.label} className="relative z-10 flex items-center gap-3 sm:block sm:text-center">
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-void text-sm",
                stage.active
                  ? "border-primary text-primary shadow-[0_0_22px_rgba(80,228,221,.35)]"
                  : "border-border text-muted-foreground",
              )}
            >
              {stage.value}
            </span>
            <div className="sm:mt-3">
              <p className={cn("text-xs", stage.active ? "text-foreground" : "text-muted-foreground")}>
                {stage.label}
              </p>
              {index < stages.length - 1 && (
                <span aria-hidden="true" className="mt-1 block text-xs text-primary/60 sm:hidden">↓</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tree geometry is presentation; cyan links only depict published relationships. */
export function KnowledgeWorldView({
  world,
  compact = false,
}: {
  world: KnowledgeWorld;
  compact?: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [labels, setLabels] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const selected =
    world.nodes.find((n) => n.id === picked) ??
    world.nodes.find((n) => n.events.length > 0) ??
    world.nodes[0];
  const glow = `world-${useId().replace(/:/g, "")}`;
  const positions = new Map(
    world.nodes.map((node, i) => {
      const angle =
        world.nodes.length === 1
          ? -Math.PI / 2
          : -Math.PI + 0.32 + (i * (Math.PI - 0.64)) / Math.max(1, world.nodes.length - 1);
      return [node.id, { x: 380 + Math.cos(angle) * 270, y: 310 + Math.sin(angle) * 205 }] as const;
    }),
  );
  const choose = (id: string) => {
    setPicked(id);
    setCardOpen(true);
  };
  const count = new Set(world.nodes.flatMap((n) => n.mes)).size;
  return (
    <section aria-label="Living Knowledgeverse" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-eyebrow">Everything is connected. Evolution is key.</p>
          <h2 className="mt-2 font-display text-xl tracking-wide text-foreground">
            Your Knowledgeverse
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={labels}
            onClick={() => setLabels((v) => !v)}
            className="min-h-11 rounded-full border border-border px-4 text-xs text-muted-foreground"
          >
            Labels {labels ? "on" : "off"}
          </button>
          <button
            type="button"
            aria-pressed={cardOpen}
            onClick={() => setCardOpen((v) => !v)}
            className="min-h-11 rounded-full border border-gold/35 px-4 text-xs text-gold"
          >
            Library Card
          </button>
          {compact && (
            <a
              href="/knowledgeverse"
              className="inline-flex min-h-11 items-center rounded-full border border-primary/25 px-4 text-xs text-primary"
            >
              Explore world
            </a>
          )}
        </div>
      </div>
      <FormationSequence world={world} />
      <div
        className={cn(
          "grid items-start gap-5",
          cardOpen && selected && "lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]",
        )}
      >
        <div className="relative min-w-0 overflow-hidden rounded-2xl border border-primary/20 bg-void/40">
          <div className="flex flex-wrap justify-between gap-2 px-5 pt-4 text-xs text-muted-foreground">
            <span>{world.source === "demo" ? "Demonstration world" : "Published world"}</span>
            <span>
              {world.nodes.length} forms · {count} meaning elements · {world.edges.length}{" "}
              relationships
            </span>
          </div>
          <svg
            viewBox="0 0 760 490"
            className="h-auto w-full"
            role="group"
            aria-label="Knowledge Forms and their published relationships"
          >
            <defs>
              <radialGradient id={glow}>
                <stop stopColor="#50e4dd" stopOpacity=".25" />
                <stop offset="1" stopColor="#50e4dd" stopOpacity="0" />
              </radialGradient>
              <linearGradient id={`${glow}-trunk`} x2="0" y2="1">
                <stop stopColor="#86eee0" />
                <stop offset="1" stopColor="#c99b62" />
              </linearGradient>
            </defs>
            <ellipse cx="380" cy="255" rx="325" ry="235" fill={`url(#${glow})`} />
            <g fill="none" stroke="#b49767" opacity=".18">
              <ellipse cx="380" cy="272" rx="320" ry="145" />
              <ellipse cx="380" cy="272" rx="258" ry="193" />
              <path d="M75 389 Q380 442 685 389" />
            </g>
            <g fill="none" stroke={`url(#${glow}-trunk)`} strokeLinecap="round">
              <path
                d="M380 401 C351 342 393 304 380 249 M380 402 C409 342 367 304 380 249"
                strokeWidth="3"
                opacity=".55"
              />
              <path
                d="M380 399 Q332 422 270 433 M380 399 Q428 422 490 433 M380 405 Q347 444 332 452 M380 405 Q413 444 428 452"
                strokeWidth="1.5"
                opacity=".35"
              />
              {world.nodes.map((n) => {
                const p = positions.get(n.id)!;
                return (
                  <path
                    key={n.id}
                    d={`M380 355 Q380 ${p.y + 75} ${p.x} ${p.y}`}
                    opacity={selected?.id === n.id ? 0.8 : 0.23}
                    strokeWidth={selected?.id === n.id ? 2 : 1}
                  />
                );
              })}
            </g>
            {world.edges.map((edge) => {
              const a = positions.get(edge.source),
                b = positions.get(edge.target);
              if (!a || !b) return null;
              return (
                <path
                  key={edge.id}
                  d={`M${a.x} ${a.y} Q380 ${Math.min(a.y, b.y) - 55} ${b.x} ${b.y}`}
                  fill="none"
                  stroke="#64e5db"
                  strokeWidth="2"
                  strokeDasharray="5 7"
                  opacity=".6"
                >
                  <title>{edge.label}</title>
                </path>
              );
            })}
            {world.nodes.map((node) => {
              const p = positions.get(node.id)!;
              const active = selected?.id === node.id;
              const r = 17 + Math.max(0, Math.min(1, node.maturity ?? 0)) * 13;
              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Explore ${node.name}`}
                  aria-pressed={active}
                  onClick={() => choose(node.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      choose(node.id);
                    }
                  }}
                  className="cursor-pointer outline-none focus:opacity-70"
                >
                  <title>
                    {node.name}: {node.state?.toLowerCase() ?? "state not published"}
                  </title>
                  <circle cx={p.x} cy={p.y} r={r + 27} fill={`url(#${glow})`} />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 10}
                    fill="none"
                    stroke={active ? "#d5b879" : "#448b88"}
                    opacity=".6"
                  />
                  <path
                    d={`M${p.x} ${p.y - r} L${p.x + r * 0.8} ${p.y} L${p.x} ${p.y + r} L${p.x - r * 0.8} ${p.y} Z`}
                    fill={active ? "#174f50" : "#102c36"}
                    stroke={active ? "#b7fff2" : "#6ac6c2"}
                    strokeWidth="1.5"
                  />
                  {node.mes.slice(0, 8).map((me, i) => {
                    const a = (i / Math.min(8, node.mes.length)) * Math.PI * 2;
                    return (
                      <circle
                        key={me}
                        cx={p.x + Math.cos(a) * (r + 17)}
                        cy={p.y + Math.sin(a) * (r + 17)}
                        r="2.5"
                        fill="#d5b879"
                      >
                        <title>{me}</title>
                      </circle>
                    );
                  })}
                  {labels && (
                    <text x={p.x} y={p.y + r + 35} textAnchor="middle" fill="#c4dedb" fontSize="12">
                      {node.name.slice(0, 32)}
                    </text>
                  )}
                </g>
              );
            })}
            <text x="380" y="472" textAnchor="middle" fill="#93aaa9" fontSize="11">
              {world.nodes.length
                ? "Select a Knowledge Form to reveal its identity and journey"
                : "No Knowledge Forms have been published"}
            </text>
          </svg>
          {selected && (
            <div className="border-t border-primary/10 px-5 py-4">
              <p className="text-sm capitalize text-primary">
                {selected.name}{" "}
                <span className="ml-2 text-xs text-muted-foreground">
                  {selected.state?.toLowerCase()}
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{selected.why}</p>
            </div>
          )}
        </div>
        {cardOpen && selected && <EntityCard key={selected.id} node={selected} />}
      </div>
      {!compact && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="glass-inset rounded-xl p-5">
              <h3 className="font-display text-gold">Emergence</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                New properties recorded through connected forms.
              </p>
              {world.emergences.length ? (
                world.emergences.map((e) => (
                  <div key={e.id} className="mt-4 rounded-lg border border-primary/20 p-4">
                    <p className="break-words text-sm text-primary">{e.property}</p>
                    <p className="mt-2 text-sm text-foreground/80">{e.capability}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {e.status} · {e.participants.length} participating forms
                    </p>
                  </div>
                ))
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No emergence has been published.
                </p>
              )}
            </section>
            <section className="glass-inset rounded-xl p-5">
              <h3 className="font-display text-gold">Possible futures</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Alternative pathways from the latest published objective.
              </p>
              {world.futures.length ? (
                world.futures.map((f) => (
                  <details key={f.id} className="mt-3 rounded-lg border border-border p-3">
                    <summary className="cursor-pointer text-sm text-foreground">
                      {f.title}
                      {f.selected && <span className="ml-2 text-xs text-primary">Selected</span>}
                    </summary>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {f.actions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                    {f.risks.length > 0 && (
                      <p className="mt-3 text-xs text-gold">{f.risks.join(" · ")}</p>
                    )}
                  </details>
                ))
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No alternative futures have been published.
                </p>
              )}
            </section>
          </div>
          <section className="rounded-xl border border-border/60 p-5">
            <p className="text-sm text-foreground">Growth follows recorded experience.</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Forms retain their identity and embodiment. Chromosomes carry starting structure;
              published relationships, development, emergence and verified lineage describe what
              changed. Selecting a form changes your view. New runtime publications update the
              world.
            </p>
          </section>
        </>
      )}
    </section>
  );
}

export function ConnectedKnowledgeWorld({ compact = false }: { compact?: boolean }) {
  const query = useQuery(surfaceQuery("knowledgeverse"));
  const world = useMemo(() => (query.data ? knowledgeWorld(query.data) : null), [query.data]);
  if (query.error)
    return (
      <div
        role="alert"
        className="rounded-lg border border-border p-5 text-sm text-muted-foreground"
      >
        The Knowledgeverse could not be read.{" "}
        <button onClick={() => query.refetch()} className="text-primary underline">
          Retry
        </button>
      </div>
    );
  if (!world)
    return (
      <p role="status" className="py-8 text-sm text-muted-foreground">
        Reading your Knowledgeverse…
      </p>
    );
  return <KnowledgeWorldView world={world} compact={compact} />;
}
