import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  Field,
  HashChip,
  List,
  PageHeader,
  Panel,
  Pill,
  Unavailable,
} from "@/components/ascension/chrome";
import { LineageSpine, ResonanceField } from "@/components/ascension/graph";
import { ChamberLoading, SourceFailure } from "@/components/ascension/states";
import { Inspect } from "@/components/ascension/inspect";
import { LiveForms, LiveProvenance, LiveSurface } from "@/components/ascension/live";
import {
  surfaceQuery,
  basename,
  buildMeaningElements,
  knowledgeFormBranch,
  knowledgeFormSections,
  knowledgeFormTitle,
  parseKnowledgeFormMes,
} from "@/lib/ascension/state";

export const Route = createFileRoute("/knowledgeverse")({
  head: () => ({
    meta: [
      { title: "Knowledgeverse State — ASCENSION" },
      {
        name: "description",
        content:
          "Meaning Elements, Knowledge Forms, relationships, emergence candidates, ID/SID and lineage read from published ASCENSION state.",
      },
      { property: "og:title", content: "Knowledgeverse State — ASCENSION" },
      {
        property: "og:description",
        content:
          "Observation view of Meaning Elements, Knowledge Forms, resonance relationships and entity lineage.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(surfaceQuery("knowledgeverse")),
  errorComponent: ({ error }) => <SourceFailure error={error} surface="Knowledgeverse" />,
  pendingComponent: () => <ChamberLoading surface="Knowledgeverse" />,
  notFoundComponent: () => <p className="font-mono text-sm">No Knowledgeverse state published.</p>,
  component: Knowledgeverse,
});

const CATEGORY_TONE: Record<string, "photon" | "gold" | "violet" | "neutral"> = {
  identity: "photon",
  constraint: "gold",
  purpose: "violet",
  environment: "neutral",
  mechanism: "neutral",
  form: "gold",
};

function Knowledgeverse() {
  const { data } = useSuspenseQuery(surfaceQuery("knowledgeverse"));
  const mes = useMemo(() => buildMeaningElements(data), [data]);
  const [category, setCategory] = useState<string>("all");
  const [openForm, setOpenForm] = useState<string | null>(data.knowledgeForms[0]?.file ?? null);
  const [selectedNode, setSelectedNode] = useState<string | undefined>();
  const [labels, setLabels] = useState(true);

  const categories = useMemo(
    () => ["all", ...new Set(mes.map((m) => m.category ?? "uncategorised"))],
    [mes],
  );
  const visible = category === "all" ? mes : mes.filter((m) => (m.category ?? "") === category);
  const entities = Object.entries(data.entities);
  // Library Card identity comes from the published operator entity record.
  const card =
    data.entities[data.chamber.entity_id ?? ""] ?? Object.values(data.entities)[0];
  const cardDestinyId = data.chamber.last_transition?.destiny_id;

  return (
    <>
      {data.live && <LiveProvenance live={data.live} />}
      <PageHeader
        eyebrow="Surface 02"
        title="Knowledgeverse"
        intent="Meaning Elements, Knowledge Forms, resonance relationships, emergence, identity and lineage."
        right={<Pill tone="photon" glow>{mes.length} meaning elements</Pill>}
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel
          eyebrow="World model"
          title="Resonance field"
          className="lg:col-span-3"
          aside={
            <button
              type="button"
              onClick={() => setLabels((v) => !v)}
              aria-pressed={labels}
              className={
                "rounded-sm border px-2.5 py-1 font-mono text-[0.62rem] tracking-[0.18em] uppercase transition-colors " +
                (labels
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              labels
            </button>
          }
        >
          <ResonanceField
            relationships={data.worldModel.relationships}
            selected={selectedNode}
            showLabels={labels}
            onSelect={(id) => setSelectedNode((prev) => (prev === id ? undefined : id))}
          />

          <div className="mt-4 space-y-3">
            {(data.worldModel.relationships ?? [])
              .filter((r) => !selectedNode || r.a === selectedNode || r.b === selectedNode)
              .map((r) => (
                <div key={`${r.a}-${r.b}`} className="glass-inset rounded-md px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="gold">{r.kind ?? "kind unavailable"}</Pill>
                    <span className="font-mono text-[0.72rem] text-foreground">
                      {r.a} ↔ {r.b}
                    </span>
                    <span className="font-mono text-[0.65rem] text-muted-foreground">
                      {r.shared_mes?.length ?? 0} shared ME
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </Panel>

        <Panel eyebrow="Emergence" title="Candidates" className="lg:col-span-2">
          {(data.worldModel.emergence_candidates ?? []).length === 0 ? (
            <Unavailable label="emergence candidates" />
          ) : (
            <div className="space-y-3">
              {(data.worldModel.emergence_candidates ?? []).map((c, i) => (
                <div key={c.note ?? i} className="glass-inset rounded-md px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[0.72rem] text-foreground">
                      {c.note ?? "note unavailable"}
                    </span>
                    <Pill tone="violet">{c.status ?? "status unavailable"}</Pill>
                  </div>
                  <p className="label-eyebrow mt-2">Shared meaning elements</p>
                  <List items={c.shared_mes} tone="photon" />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        eyebrow="Meaning Elements"
        title="Governed units of meaning"
        aside={
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={
                  "rounded-sm border px-2 py-1 font-mono text-[0.62rem] tracking-[0.18em] uppercase transition-colors " +
                  (category === c
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {c}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((me) => (
            <div key={me.me_id} className="glass-inset rounded-md px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <Pill tone={CATEGORY_TONE[me.category ?? ""] ?? "neutral"}>
                  {me.category ?? "uncategorised"}
                </Pill>
                <span className="font-mono text-[0.62rem] text-gold/80">{me.hash ?? "—"}</span>
              </div>
              <p className="mt-2 text-sm text-foreground">{me.text ?? me.lexeme ?? <Unavailable />}</p>
              <p className="mt-2 font-mono text-[0.62rem] break-words text-muted-foreground">
                {me.me_id}
              </p>
              <p className="label-eyebrow mt-2">Used by</p>
              <p className="font-mono text-[0.65rem] break-words text-muted-foreground">
                {me.usedBy.length ? me.usedBy.join(" · ") : "unavailable"}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="Knowledge Forms" title="Published artifacts">
        <div className="space-y-3">
          {data.knowledgeForms.map((form) => {
            const open = openForm === form.file;
            const refs = parseKnowledgeFormMes(form);
            return (
              <div key={form.file} className="glass-inset rounded-md">
                <button
                  type="button"
                  onClick={() => setOpenForm(open ? null : form.file)}
                  className="flex min-h-11 w-full flex-wrap items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-primary/5"
                  aria-expanded={open}
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-display text-sm tracking-wide break-words text-foreground">
                      {knowledgeFormTitle(form) ?? form.file}
                    </span>
                    <span className="mt-1 block font-mono text-[0.65rem] break-all text-muted-foreground">
                      {form.file}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Pill tone="photon">{refs.length} ME</Pill>
                    <Pill tone="gold">{open ? "collapse" : "inspect"}</Pill>
                  </span>
                </button>
                {open && (
                  <div className="space-y-4 border-t border-border/50 px-3 py-4">
                    <div className="glass relative overflow-hidden rounded-md px-4 py-4">
                      <div className="gold-rule absolute inset-x-4 top-0 h-px opacity-70" />
                      <p className="label-eyebrow">Library Card</p>
                      <h3 className="text-etched mt-1 font-display text-base tracking-[0.14em] text-gold uppercase">
                        {knowledgeFormTitle(form) ?? form.file}
                      </h3>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Field label="Name / type" value={`Knowledge Form · ${basename(form.file)}`} mono />
                        <Field label="ID (entity_id)" value={card?.entity_id} mono />
                        <Field label="SID" value={card?.sid} mono />
                        <Field label="WHO · operator" value={card?.operator_label} />
                        <Field label="WHAT · destiny" value={card?.destiny} />
                        <Field
                          label="WHY · purpose meaning elements"
                          value={
                            (card?.me_ids ?? [])
                              .filter((m) => m.includes(":purpose:"))
                              .map((m) => m.split(":")[2]?.replace(/-/g, " "))
                              .join(" · ") || undefined
                          }
                        />
                        <Field
                          label="Chromosome / genesis type"
                          value={card?.chromosome ? "present" : undefined}
                        />
                        <Field label="Meaning Elements in form" value={refs.length} mono />
                        <Field label="Executed branch" value={knowledgeFormBranch(form)} mono />
                        <Field
                          label="Verified Δ"
                          mono
                          value={
                            card?.delta
                              ? `K ${card.delta.K} · U ${card.delta.U} · W ${card.delta.W}`
                              : undefined
                          }
                        />
                        <Field label="Phenotype · lineage depth" value={card?.lineage?.length} mono />
                        <Field
                          label="Relationships"
                          value={
                            (data.worldModel.relationships ?? []).filter(
                              (r) => r.a === cardDestinyId || r.b === cardDestinyId,
                            ).length || data.worldModel.relationships?.length
                          }
                          mono
                        />
                        <Field
                          label="Environment / constraints"
                          className="sm:col-span-2"
                          value={
                            Object.values(card?.destinies ?? {})
                              .flatMap((d) => d.constraint_mes ?? [])
                              .map((c) => c.text ?? c.me_id)
                              .join(" · ") || undefined
                          }
                        />
                        <Field label="Inherited / emerged traits" value={undefined} />
                        <Field
                          label="Purpose / trajectory"
                          className="sm:col-span-3"
                          value={knowledgeFormSections(form).join(" → ") || undefined}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      {refs.map((ref) => (
                        <div key={ref.me_id} className="rounded-sm border border-border/50 px-2.5 py-2">
                          <Pill tone={CATEGORY_TONE[ref.category ?? ""] ?? "neutral"}>
                            {ref.category ?? "uncategorised"}
                          </Pill>
                          <p className="mt-1.5 text-[0.82rem] text-foreground">
                            {ref.text ?? <Unavailable />}
                          </p>
                          <p className="font-mono text-[0.6rem] break-words text-muted-foreground">
                            {ref.me_id}
                          </p>
                        </div>
                      ))}
                    </div>

                    <Inspect label="Inspect raw artifact" note={form.file}>
                      <pre className="max-h-72 overflow-auto rounded-sm border border-border/50 bg-void/70 p-3 font-mono text-[0.68rem] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                        {form.content}
                      </pre>
                    </Inspect>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {entities.map(([key, entity]) => (
          <Panel key={key} eyebrow="Identity" title={key}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ID (entity_id)" value={entity.entity_id} mono />
              <Field label="SID" value={entity.sid} mono />
              <Field label="WHO · operator label" value={entity.operator_label} mono />
              <Field label="Created at" value={entity.created_at} mono />
              <Field
                label="WHAT · active destiny"
                value={entity.destiny}
                className="sm:col-span-2"
              />
              <Field
                label="WHY · purpose meaning elements"
                className="sm:col-span-2"
                value={
                  (entity.me_ids ?? []).some((m) => m.includes(":purpose:"))
                    ? (entity.me_ids ?? [])
                        .filter((m) => m.includes(":purpose:"))
                        .map((m) => m.split(":")[2]?.replace(/-/g, " "))
                        .join(" · ")
                    : undefined
                }
              />
              <Field
                label="Verified Δ"
                mono
                value={
                  entity.delta
                    ? `K ${entity.delta.K} · U ${entity.delta.U} · W ${entity.delta.W}`
                    : undefined
                }
              />
              <Field label="Chromosome / genesis" value={entity.chromosome ? "present" : undefined} />
            </div>

            <div className="mt-4">
              <p className="label-eyebrow mb-2">Destinies carried</p>
              {Object.keys(entity.destinies ?? {}).length === 0 ? (
                <Unavailable label="destinies" />
              ) : (
                <div className="space-y-2">
                  {Object.entries(entity.destinies ?? {}).map(([destinyId, destiny]) => (
                    <div key={destinyId} className="glass-inset rounded-md px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[0.68rem] text-gold/85">{destinyId}</span>
                        <Pill tone="photon">{destiny.cycles ?? 0} cycles</Pill>
                      </div>
                      <p className="mt-1.5 text-[0.82rem] text-foreground">
                        {destiny.destiny ?? <Unavailable />}
                      </p>
                      {destiny.constraint_mes?.length ? (
                        <p className="mt-1 font-mono text-[0.62rem] text-muted-foreground">
                          constraint ME: {destiny.constraint_mes.map((c) => c.text ?? c.me_id).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              <p className="label-eyebrow mb-2">Lineage / ancestry</p>
              <LineageSpine lineage={entity.lineage} />
            </div>
          </Panel>
        ))}
      </div>

      <Panel eyebrow="World model" title="Known state">
        {Object.keys(data.worldModel.known_state ?? {}).length === 0 ? (
          <Unavailable label="known_state" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {Object.entries(data.worldModel.known_state ?? {}).map(([key, known]) => (
              <div key={key} className="glass-inset rounded-md px-3 py-3">
                <p className="font-mono text-[0.68rem] text-gold/85">{key}</p>
                <p className="mt-2 text-[0.8rem] text-foreground">{basename(known.artifact) ?? "artifact unavailable"}</p>
                <p className="label-eyebrow mt-2">Artifact sha256</p>
                <HashChip value={known.artifact_sha256} />
                <p className="mt-2 font-mono text-[0.68rem] text-muted-foreground">
                  {known.delta ? `ΔK ${known.delta.K} · ΔU ${known.delta.U} · ΔW ${known.delta.W}` : "delta unavailable"}
                </p>
                <p className="font-mono text-[0.62rem] break-words text-muted-foreground">
                  {known.sid ?? "sid unavailable"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {data.live && (
        <div className="space-y-5">
          <LiveSurface
            eyebrow="Knowledgeverse"
            title="Live form specifications"
            path="/api/ascension/v1/knowledgeverse"
            response={data.live.surfaces["knowledgeverse"]}
          />
          <LiveForms live={data.live} />
        </div>
      )}
    </>
  );
}
