import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import {
  Field,
  HashChip,
  List,
  Meter,
  Panel,
  Pill,
  StatusPill,
  Unavailable,
} from "@/components/ascension/chrome";
import { ChamberLoading, SourceFailure } from "@/components/ascension/states";
import { Inspect, Stage } from "@/components/ascension/inspect";
import {
  BranchFan,
  DeltaEvolution,
  EngineRing,
  FlowLegend,
  TreeGlyph,
  type EngineSignal,
} from "@/components/ascension/flow";
import {
  LiveController,
  LiveGovernedState,
  LiveProvenance,
  LiveSurface,
} from "@/components/ascension/live";
import { surfaceQuery, basename, buildMeaningElements } from "@/lib/ascension/state";
import chamberPlate from "@/assets/chamber.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ASCENSION Chamber — Destiny, Engines, Verified Δ" },
      {
        name: "description",
        content:
          "Read-only chamber view of the ASCENSION governed core: destiny, six engines, Destiny Crystal, Tree state, emergence, DTF and Verified Δ.",
      },
      { property: "og:title", content: "ASCENSION Chamber — Destiny, Engines, Verified Δ" },
      {
        property: "og:description",
        content:
          "Destiny, engine activity, Destiny Crystal readiness, Tree/chromosome state, Transverse pathways and Verified Δ, projected read-only from published state.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(surfaceQuery("chamber")),
  errorComponent: ({ error }) => <SourceFailure error={error} surface="Chamber" />,
  pendingComponent: () => <ChamberLoading surface="Chamber" />,
  notFoundComponent: () => <p className="font-mono text-sm">No chamber state published.</p>,
  component: Chamber,
});

function Chamber() {
  const { data } = useSuspenseQuery(surfaceQuery("chamber"));
  const { chamber, semantic, entities, worldModel } = data;
  const t = chamber.last_transition;
  const branches = t?.branches ?? [];
  const executed = branches.find((b) => b.branch_id === t?.branch_id);
  const recommended = branches.find(
    (b) => b.status === "recommended" || b.evaluation?.recommended_by,
  );
  const operator = entities[chamber.entity_id ?? ""] ?? Object.values(entities)[0];
  const destinyId = t?.destiny_id;
  const cycles = destinyId ? operator?.destinies?.[destinyId]?.cycles : undefined;
  const mes = buildMeaningElements(data);

  const engines: EngineSignal[] = [
    { name: "Analyzer", source: "no per-engine runtime field in published contracts" },
    { name: "Akashic", source: "no per-engine runtime field in published contracts" },
    { name: "Projector", source: "no per-engine runtime field in published contracts" },
    {
      name: "Outcome Predictor",
      reading: executed?.evaluation?.outcome_predictor?.toFixed(3),
      source: "last_transition.branches[].evaluation.outcome_predictor",
    },
    {
      name: "Confidence Engine",
      reading: executed?.confidence?.toFixed(3),
      source: "last_transition.branches[].confidence",
    },
    {
      name: "Guardian",
      reading: executed?.evaluation?.guardian,
      source: "last_transition.branches[].evaluation.guardian",
    },
  ];

  return (
    <>
      {/* ═══ ENTRY ═══ */}
      <section className="crystal-frame relative overflow-hidden rounded-lg">
        <img
          src={chamberPlate.url}
          alt="The ASCENSION chamber: a crystalline tree of knowledge above concentric metallic platforms"
          className="absolute inset-0 size-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-void/55 via-void/80 to-void" />
        <span className="gold-rule absolute inset-x-8 top-0 z-10 h-px opacity-80" />
        <div className="relative px-5 py-12 sm:px-10 sm:py-20">
          <p className="label-eyebrow">Ascension · Entry</p>
          <h1 className="text-etched mt-3 font-display text-3xl leading-tight text-foreground uppercase sm:text-5xl">
            Everything is connected
            <span className="mt-1 block text-gold">Evolution is key</span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            The chamber is observing itself. Below is what ASCENSION is doing right now —
            every underlying hash, receipt and constraint stays one layer deeper.
          </p>
          <div className="mt-8 max-w-2xl">
            <p className="label-eyebrow">Destiny · active objective</p>
            <p className="text-etched mt-2 font-display text-xl leading-snug text-primary sm:text-2xl">
              {chamber.destiny ?? <Unavailable label="destiny" />}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill tone="photon" glow>
                {chamber.outcome_status ?? "status unavailable"}
              </Pill>
              <Pill tone="gold">{chamber.verification_result ?? "verification unavailable"}</Pill>
              <Pill tone="violet">{chamber.verified_transitions ?? "—"} verified transitions</Pill>
            </div>
          </div>
        </div>
      </section>

      <FlowLegend
        steps={[
          "Destiny",
          "Six engines",
          "Destiny Crystal",
          "Tree / chromosome",
          "Emergence",
          "Transverse / DTF",
          "Verified Δ",
        ]}
      />

      {/* ═══ EXPERIENCE FLOW ═══ */}
      <div>
        <Stage
          index="01"
          name="Destiny"
          read={chamber.destiny ?? "unavailable"}
          glyph={
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Destiny id" value={destinyId} mono />
              <Field label="Cycles on this destiny" value={cycles} mono />
              <Field label="Operator" value={operator?.operator_label} mono />
            </div>
          }
        >
          <Inspect label="Inspect destiny record" note="entities.json · chamber_state.json">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Entity ID" value={t?.entity_id ?? operator?.entity_id} mono />
              <Field label="SID" value={t?.sid ?? operator?.sid} mono />
              <Field label="Created at" value={operator?.created_at} mono />
              <Field
                label="Destinies carried"
                value={Object.keys(operator?.destinies ?? {}).length || undefined}
                mono
              />
            </div>
          </Inspect>
        </Stage>

        <Stage
          index="02"
          name="Six engine activity"
          read="Charge · amplify · process · distribute"
          glyph={
            <div className="mt-4">
              <EngineRing engines={engines} />
            </div>
          }
        >
          <Inspect label="Inspect engine sources" note="published field per engine">
            <div className="grid gap-3 sm:grid-cols-2">
              {engines.map((e) => (
                <Field
                  key={e.name}
                  label={e.name}
                  mono
                  value={e.reading ?? undefined}
                  className={e.reading ? undefined : "opacity-80"}
                />
              ))}
            </div>
            <ul className="mt-3 space-y-1">
              {engines.map((e) => (
                <li key={e.name} className="font-mono text-[0.62rem] text-muted-foreground">
                  {e.name} ← {e.source}
                </li>
              ))}
            </ul>
          </Inspect>
        </Stage>

        <Stage
          index="03"
          name="Destiny Crystal"
          read="Integrated engine output · readiness"
          glyph={
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Meter label="Integrated confidence" value={executed?.confidence} />
              <Meter label="Predicted outcome" value={executed?.evaluation?.outcome_predictor} />
              <Meter label="Maturity bonus" value={executed?.evaluation?.maturity_bonus} />
            </div>
          }
        >
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Executed branch" value={executed?.approach ?? t?.branch_id} mono />
            <Field label="Capability" value={t?.execution_receipt?.capability} mono />
            <Field
              label="Manifestation artifact"
              value={basename(t?.execution_receipt?.artifact)}
              mono
            />
          </div>
          <Inspect label="Inspect readiness & receipt" note="execution_receipt">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Receipt action" value={t?.execution_receipt?.action} mono />
              <Field label="Total bytes" value={t?.execution_receipt?.total_bytes} mono />
              <Field label="Artifact sha256" value={<HashChip value={t?.execution_receipt?.sha256} />} />
              <Field
                label="Persisted"
                value={t?.persisted === undefined ? undefined : String(t.persisted)}
                mono
              />
              <Field label="Unreal runtime status" value={undefined} className="sm:col-span-2" />
            </div>
            <p className="mt-3 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
              Unreal / CAD runtime state is not part of the published contracts.
            </p>
          </Inspect>
        </Stage>

        <Stage
          index="04"
          name="Tree · chromosome / genesis"
          read="Crystal package received · relational analysis · development"
          glyph={
            <div className="mt-4">
              <TreeGlyph
                meCount={mes.length}
                relationships={worldModel.relationships?.length}
                emergence={worldModel.emergence_candidates?.length}
                lineageDepth={operator?.lineage?.length}
              />
            </div>
          }
        >
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="WHO · operator" value={operator?.operator_label} />
            <Field label="WHAT · active destiny" value={operator?.destiny} />
            <Field
              label="WHY · purpose meaning elements"
              value={
                (operator?.me_ids ?? [])
                  .filter((m) => m.includes(":purpose:"))
                  .map((m) => m.split(":")[2]?.replace(/-/g, " "))
                  .join(" · ") || undefined
              }
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field
              label="Chromosome / genesis state"
              value={operator?.chromosome ? "present" : undefined}
            />
            <Field label="Developmental phenotype · cycles" value={cycles} mono />
            <Field label="Meaning Elements held" value={operator?.me_ids?.length} mono />
          </div>
          <Inspect label="Inspect Tree state" note="entities.json · world_model.json">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Lineage depth" value={operator?.lineage?.length} mono />
              <Field label="World model state hash" value={<HashChip value={worldModel.state_hash} />} />
              <Field
                label="Entity Verified Δ total"
                mono
                value={
                  operator?.delta
                    ? `K ${operator.delta.K} · U ${operator.delta.U} · W ${operator.delta.W}`
                    : undefined
                }
              />
              <Field label="Chromosome payload" value={undefined} />
            </div>
            <p className="mt-3 font-mono text-[0.62rem] text-muted-foreground">
              Full Knowledgeverse detail lives on the{" "}
              <Link to="/knowledgeverse" className="text-primary underline">
                Knowledgeverse
              </Link>{" "}
              surface.
            </p>
          </Inspect>
        </Stage>

        <Stage
          index="05"
          name="Current emergence"
          read={`${worldModel.emergence_candidates?.length ?? 0} candidate compositions`}
          glyph={
            <div className="mt-4 space-y-3">
              {(worldModel.emergence_candidates ?? []).length === 0 ? (
                <Unavailable label="emergence candidates" />
              ) : (
                (worldModel.emergence_candidates ?? []).map((c, i) => (
                  <div key={c.note ?? i} className="glass rounded-md px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-foreground">{c.note ?? "note unavailable"}</span>
                      <Pill tone="violet" glow>
                        {c.status ?? "status unavailable"}
                      </Pill>
                    </div>
                    <p className="label-eyebrow mt-2">Resonating through shared meaning</p>
                    <List items={c.shared_mes} />
                  </div>
                ))
              )}
            </div>
          }
        />

        <Stage
          index="06"
          name="Transverse · DTF"
          read={`${branches.length} pathways from one origin`}
          glyph={
            <div className="mt-4">
              <BranchFan
                branches={branches}
                executedId={t?.branch_id}
                recommendedId={recommended?.branch_id}
              />
            </div>
          }
        >
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Wisdom recommendation" value={recommended?.approach} />
            <Field label="Recommended by" value={recommended?.evaluation?.recommended_by} mono />
            <Field
              label="Executed matches recommendation"
              mono
              value={
                t?.branch_id && recommended?.branch_id
                  ? String(t.branch_id === recommended.branch_id).toUpperCase()
                  : undefined
              }
            />
          </div>
          <Inspect label="Inspect branch evaluation" note="last_transition.branches[]">
            <div className="grid gap-3">
              {branches.length === 0 ? (
                <Unavailable label="branches" />
              ) : (
                branches.map((b) => (
                  <div key={b.branch_id} className="rounded-sm border border-border/50 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[0.68rem] text-gold/85">{b.branch_id}</span>
                      <Pill tone="neutral">{b.status ?? "status unavailable"}</Pill>
                      <StatusPill label="Guardian" value={b.evaluation?.guardian} />
                    </div>
                    <p className="mt-2 font-mono text-[0.65rem] text-muted-foreground">
                      confidence {b.confidence ?? "unavailable"} · predictor{" "}
                      {b.evaluation?.outcome_predictor ?? "unavailable"} · violations{" "}
                      {b.evaluation?.violations?.length ?? 0} · contradictions{" "}
                      {b.evaluation?.contradictions?.length ?? 0}
                    </p>
                  </div>
                ))
              )}
            </div>
            <p className="mt-3 font-mono text-[0.62rem] text-muted-foreground">
              Full trajectory comparison lives on the{" "}
              <Link to="/pathways" className="text-primary underline">
                Pathways
              </Link>{" "}
              surface.
            </p>
          </Inspect>
        </Stage>

        <Stage
          index="07"
          name="Verified Δ"
          read="Accepted evolution"
          glyph={
            <div className="mt-4">
              <DeltaEvolution
                proposed={t?.proposed_delta}
                accepted={t?.accepted_delta}
                total={chamber.entity_delta_total}
                persisted={t?.persisted}
                verification={t?.verification?.result}
              />
            </div>
          }
        >
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <StatusPill label="Guardian" value={executed?.evaluation?.guardian} />
            <StatusPill
              label="AutoSync ledger"
              value={
                semantic.ledger_valid === undefined
                  ? undefined
                  : String(semantic.ledger_valid).toUpperCase()
              }
            />
            <StatusPill label="Verification" value={t?.verification?.result} />
          </div>
          <Inspect label="Inspect verified transition" note="hashes · authority · evidence">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Transition id" value={t?.transition_id} mono />
              <Field label="Timestamp" value={t?.timestamp} mono />
              <Field label="Authority" value={t?.authority} mono />
              <Field label="Rejection reason" value={t?.rejection_reason ?? undefined} mono />
              <Field label="previous_hash" value={<HashChip value={t?.previous_hash} />} />
              <Field label="record_hash" value={<HashChip value={t?.record_hash} />} />
              <Field label="previous_state_hash" value={<HashChip value={t?.previous_state_hash} />} />
              <Field label="persisted_hash" value={<HashChip value={t?.persisted_hash} />} />
              <Field label="Ledger entries" value={semantic.ledger_entries} mono />
              <Field label="State updated at" value={semantic.updated_at} mono />
            </div>
            <div className="mt-3">
              <p className="label-eyebrow mb-2">Violations</p>
              <List items={executed?.evaluation?.violations} tone="danger" />
            </div>
            <p className="mt-3 font-mono text-[0.62rem] text-muted-foreground">
              Full hash chain lives on the{" "}
              <Link to="/ledger" className="text-primary underline">
                Verified Δ ledger
              </Link>{" "}
              surface.
            </p>
          </Inspect>
        </Stage>
      </div>

      {/* ═══ BRIDGE / GOVERNANCE SUMMARY ═══ */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel eyebrow="Galaxy Bridge" title="Resonance & provenance">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Resonant relationships" value={worldModel.relationships?.length} mono />
            <Field label="Emergence candidates" value={worldModel.emergence_candidates?.length} mono />
            <Field
              label="Evidence records"
              value={Object.keys(data.evidence.evidence ?? {}).length || undefined}
              mono
            />
            <Field label="Bridge permissions" value={undefined} />
          </div>
          <Inspect label="Inspect bridge availability" note="not published">
            <p className="font-mono text-[0.68rem] leading-relaxed text-muted-foreground">
              Galaxy Bridge permission grants and resonance scores are not present in
              chamber_state.json, semantic_state.json, world_model.json or ledger.jsonl. Resonance is
              shown only as published shared-ME relationships; no permission value is inferred.
            </p>
          </Inspect>
        </Panel>

        <Panel eyebrow="Guardian" title="Protective law">
          <div className="space-y-3">
            <StatusPill label="Verdict" value={executed?.evaluation?.guardian} />
            <Field label="Authority" value={t?.authority} mono />
            <Field
              label="Constraints in registry"
              value={Object.keys(data.constraints.constraints ?? {}).length || undefined}
              mono
            />
            <p className="font-mono text-[0.62rem] text-muted-foreground">
              Constraint applicability and evidence basis live on the{" "}
              <Link to="/governance" className="text-primary underline">
                Governance
              </Link>{" "}
              surface.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
