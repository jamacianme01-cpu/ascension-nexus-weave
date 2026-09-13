import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Panel, Pill, Unavailable } from "@/components/ascension/chrome";
import { LineageSpine, ResonanceField } from "@/components/ascension/graph";
import { ChamberLoading, SourceFailure } from "@/components/ascension/states";
import { buildMeaningElements, surfaceQuery } from "@/lib/ascension/state";
import type { EntityRecord } from "@/lib/ascension/contracts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/knowledgeverse")({
  head: () => ({
    meta: [
      { title: "Knowledgeverse — ASCENSION" },
      {
        name: "description",
        content:
          "The living Knowledgeverse: your objectives become identity, meaning, relationships, futures and verified evolution — a world that grows richer as you use it.",
      },
      { property: "og:title", content: "Knowledgeverse — ASCENSION" },
      {
        property: "og:description",
        content:
          "A living world formed from your destiny, meaning, relationships and verified experience.",
      },
    ],
  }),
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(surfaceQuery("knowledgeverse")),
  errorComponent: ({ error }) => <SourceFailure error={error} surface="Knowledgeverse" />,
  pendingComponent: () => <ChamberLoading surface="Knowledgeverse" />,
  notFoundComponent: () => (
    <p className="font-mono text-sm">No Knowledgeverse state published.</p>
  ),
  component: KnowledgeverseWorld,
});

function deltaText(delta?: { K?: number; U?: number; W?: number } | null): string | null {
  if (!delta) return null;
  return `K ${delta.K ?? 0} · U ${delta.U ?? 0} · W ${delta.W ?? 0}`;
}

function entityTitle(id: string, record: EntityRecord): string {
  if (record.operator_label) return record.operator_label;
  const live = record.live_card as Record<string, unknown> | undefined;
  const who = live && typeof live["who"] === "string" ? live["who"] : null;
  if (who) return who;
  return id.replace(/^(ENTITY|DESTINY):/i, "").replace(/[-_]/g, " ");
}

function LibraryCard({
  id,
  record,
  selected,
  onSelect,
}: {
  id: string;
  record: EntityRecord;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const live = record.live_card as Record<string, unknown> | null | undefined;
  const liveDevelopment = live?.["coverage_v2"] as Record<string, unknown> | undefined;
  const who = (live && typeof live["who"] === "string" && live["who"]) || undefined;
  const what = (live && typeof live["what"] === "string" && live["what"]) || undefined;
  const why = (live && typeof live["why"] === "string" && live["why"]) || undefined;
  const development = liveDevelopment?.["development"] as Record<string, unknown> | undefined;
  const developmentalState =
    development && typeof development["developmental_state"] === "string"
      ? development["developmental_state"]
      : undefined;
  const destinies = Object.entries(record.destinies ?? {});
  const delta = deltaText(record.delta);

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      className={cn(
        "glass-inset rounded-md px-4 py-4 text-left transition-all duration-200",
        selected
          ? "border border-gold/50 bg-gold/[0.07] gold-glow"
          : "border border-border/60 hover:border-primary/30",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-[0.95rem] tracking-wide text-primary">
          {entityTitle(id, record)}
        </p>
        <Pill label="" value={record.sid ? "sid live" : "sid unavailable"} />
      </div>
      <p className="mt-1 font-mono text-[0.62rem] break-all text-muted-foreground/80">{id}</p>
      {(who || what || why || record.destiny) && (
        <p className="mt-2 text-[0.86rem] leading-relaxed text-foreground/80">
          {[who && `${who}.`, record.destiny].filter(Boolean).join(" ")}
          {what && <span className="block text-muted-foreground">{what}</span>}
          {why && <span className="block text-muted-foreground">{why}</span>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[0.6rem] tracking-[0.12em] uppercase">
        {developmentalState && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-muted-foreground">
            {String(developmentalState).toLowerCase()}
          </span>
        )}
        {destinies.length > 0 && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-muted-foreground">
            {destinies.length} destin{destinies.length === 1 ? "y" : "ies"}
          </span>
        )}
        {(record.lineage?.length ?? 0) > 0 && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-muted-foreground">
            lineage · {record.lineage!.length}
          </span>
        )}
        {(record.me_ids?.length ?? 0) > 0 && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-muted-foreground">
            meaning · {record.me_ids!.length}
          </span>
        )}
        {delta && (
          <span className="rounded-sm border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-gold">
            Δ {delta}
          </span>
        )}
      </div>
    </button>
  );
}

function KnowledgeverseWorld() {
  const { data } = useSuspenseQuery(surfaceQuery("knowledgeverse"));
  const mes = useMemo(() => buildMeaningElements(data), [data]);
  const entities = useMemo(() => Object.entries(data.entities), [data.entities]);
  const relationships = data.worldModel.relationships ?? [];
  const emergence = data.worldModel.emergence_candidates ?? [];
  const [selected, setSelected] = useState<string | undefined>(
    entities[0]?.[0] ?? relationships[0]?.a,
  );

  const selectedRecord = selected ? data.entities[selected] : undefined;

  const totals = useMemo(() => {
    let K = 0;
    let U = 0;
    let W = 0;
    let lineage = 0;
    for (const record of Object.values(data.entities)) {
      K += record.delta?.K ?? 0;
      U += record.delta?.U ?? 0;
      W += record.delta?.W ?? 0;
      lineage += record.lineage?.length ?? 0;
    }
    return { K, U, W, lineage };
  }, [data.entities]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="label-eyebrow">Your living world</p>
        <h1 className="text-etched font-display text-xl tracking-[0.2em] text-foreground uppercase sm:text-2xl">
          Knowledgeverse
        </h1>
        <p className="max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
          Everything you engage ASCENSION with becomes part of this world — identity, meaning,
          relationships, possible futures and verified evolution. It remembers, and it grows
          richer as verified experience accumulates.
        </p>
      </header>

      <section aria-label="World pulse" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["meaning elements", String(mes.length)],
          ["entities", String(entities.length)],
          ["relationships", String(relationships.length)],
          ["verified lineage", String(totals.lineage)],
        ].map(([label, value]) => (
          <div key={label} className="glass-inset rounded-md px-3 py-3 text-center">
            <p className="font-display text-lg text-primary">{value}</p>
            <p className="mt-0.5 font-mono text-[0.58rem] tracking-[0.18em] text-muted-foreground uppercase">
              {label}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="The world" eyebrow="Meaning becomes structure">
          <ResonanceField
            relationships={relationships}
            onSelect={setSelected}
            selected={selected}
          />
          {relationships.length === 0 && (
            <p className="mt-3 text-[0.85rem] leading-relaxed text-muted-foreground">
              {entities.length > 0
                ? "Your world has formed its first identities. Relationships appear as meaning resonates between your objectives."
                : "Engage ASCENSION with an objective and this world begins to form."}
            </p>
          )}
        </Panel>

        <Panel title="Possible compositions" eyebrow="Emergence">
          {emergence.length > 0 ? (
            <ul className="space-y-2">
              {emergence.slice(0, 4).map((candidate, index) => (
                <li
                  key={index}
                  className="rounded-sm border border-border/70 bg-violet/[0.04] px-3 py-2.5"
                >
                  <p className="text-[0.88rem] leading-relaxed text-foreground/85">
                    {candidate.note ?? "A new structure is trying to emerge from shared meaning."}
                  </p>
                  {(candidate.shared_mes?.length ?? 0) > 0 && (
                    <p className="mt-1 font-mono text-[0.6rem] tracking-[0.14em] text-muted-foreground uppercase">
                      resonating through {candidate.shared_mes!.length} shared meaning elements
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Unavailable label="emergence" />
          )}
        </Panel>
      </div>

      <section aria-label="Library Cards" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="label-eyebrow">Library Cards</p>
            <h2 className="font-display text-base text-gold uppercase">
              What every entity is, and what it became
            </h2>
          </div>
          <p className="font-mono text-[0.6rem] tracking-[0.18em] text-muted-foreground uppercase">
            persistent id · current sid · lineage
          </p>
        </div>
        {entities.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {entities.map(([id, record]) => (
              <LibraryCard
                key={id}
                id={id}
                record={record}
                selected={selected === id}
                onSelect={setSelected}
              />
            ))}
          </div>
        ) : (
          <Unavailable label="library cards" />
        )}
      </section>

      <Panel title="Memory & lineage" eyebrow="What this world remembers">
        {selectedRecord ? (
          <div className="space-y-3">
            <p className="text-[0.9rem] text-muted-foreground">
              {entityTitle(selected ?? "", selectedRecord)} · current SID{" "}
              <span className="font-mono text-[0.72rem] text-gold/80">
                {selectedRecord.sid ?? "unavailable"}
              </span>
            </p>
            {selectedRecord.lineage && selectedRecord.lineage.length > 0 ? (
              <LineageSpine lineage={selectedRecord.lineage.slice(-8)} />
            ) : (
              <Unavailable label="lineage" />
            )}
          </div>
        ) : (
          <Unavailable label="memory" />
        )}
        <div className="mt-4 flex flex-wrap gap-1.5 font-mono text-[0.6rem] tracking-[0.14em] uppercase">
          <span className="rounded-sm border border-gold/40 bg-gold/10 px-2 py-1 text-gold">
            accumulated Δ · K {totals.K} · U {totals.U} · W {totals.W}
          </span>
        </div>
      </Panel>
    </div>
  );
}
