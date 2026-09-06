import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import {
  DeltaMeters,
  Field,
  List,
  Meter,
  PageHeader,
  Panel,
  Pill,
  HashChip,
  StatusPill,
  Unavailable,
} from "@/components/ascension/chrome";
import { ascensionStateQuery, basename } from "@/lib/ascension/state";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ASCENSION Chamber — Verified Δ Observation Console" },
      {
        name: "description",
        content:
          "Read-only chamber view of the ASCENSION governed core: destiny, Verified Δ, Guardian verdict, and the last verified transition.",
      },
      { property: "og:title", content: "ASCENSION Chamber — Verified Δ Observation Console" },
      {
        property: "og:description",
        content:
          "Destiny, Knowledge/Understanding/Wisdom deltas, Guardian verdict and verification state, projected read-only from published state.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ascensionStateQuery),
  errorComponent: ({ error }) => (
    <p role="alert" className="font-mono text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => <p className="font-mono text-sm">No chamber state published.</p>,
  component: Chamber,
});

function Chamber() {
  const { data } = useSuspenseQuery(ascensionStateQuery);
  const { chamber, semantic, entities, worldModel } = data;
  const t = chamber.last_transition;
  const executed = t?.branches?.find((b) => b.branch_id === t?.branch_id);
  const operator = entities[chamber.entity_id ?? ""] ?? Object.values(entities)[0];
  const destinyId = t?.destiny_id;
  const cycles = destinyId ? operator?.destinies?.[destinyId]?.cycles : undefined;

  return (
    <>
      <section className="relative overflow-hidden rounded-lg border border-border/70 px-5 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute inset-x-1/4 -top-24 h-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative">
          <p className="label-eyebrow">Ascension · Entry</p>
          <h1 className="text-etched mt-3 font-display text-3xl leading-tight text-foreground uppercase sm:text-5xl">
            Everything is connected
            <span className="mt-1 block text-gold">Evolution is key</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            A read-only manifestation of the governed core. Nothing here writes to the
            Knowledgeverse runtime, DTF, Galaxy Bridge, Guardian, AutoSync or Verified Δ.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Field label="Destiny / active objective" value={chamber.destiny} />
            <Field label="Destiny id" value={destinyId} mono />
          </div>
        </div>
      </section>

      <PageHeader
        eyebrow="Surface 01"
        title="Chamber"
        intent="Objective status, Verified Δ, Guardian verdict and the last verified transition."
        right={
          <div className="flex flex-wrap gap-2">
            <Pill tone="photon" glow>
              {chamber.outcome_status ?? "status unavailable"}
            </Pill>
            <Pill tone="gold">{chamber.verification_result ?? "verification unavailable"}</Pill>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel eyebrow="Verified Δ" title="Knowledge → Understanding → Wisdom" className="lg:col-span-2">
          <DeltaMeters delta={chamber.entity_delta_total} />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field
              label="Accepted Δ (last transition)"
              mono
              value={
                t?.accepted_delta
                  ? `K ${t.accepted_delta.K} · U ${t.accepted_delta.U} · W ${t.accepted_delta.W}`
                  : undefined
              }
            />
            <Field
              label="Proposed Δ (last transition)"
              mono
              value={
                t?.proposed_delta
                  ? `K ${t.proposed_delta.K} · U ${t.proposed_delta.U} · W ${t.proposed_delta.W}`
                  : undefined
              }
            />
            <Field label="Verified transitions" mono value={chamber.verified_transitions} />
          </div>
        </Panel>

        <Panel eyebrow="Guardian" title="Governance verdict">
          <div className="space-y-3">
            <StatusPill label="Guardian" value={executed?.evaluation?.guardian} />
            <StatusPill label="Outcome" value={t?.outcome_status ?? undefined} />
            <StatusPill label="Verification" value={t?.verification?.result} />
            <Field label="Authority" value={t?.authority} mono />
            <Field
              label="Rejection reason"
              value={t?.rejection_reason ?? undefined}
              mono
            />
            <div>
              <p className="label-eyebrow mb-2">Violations</p>
              <List items={executed?.evaluation?.violations} tone="danger" />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel eyebrow="Last verified transition" title={t?.transition_id ?? "unavailable"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Timestamp" value={t?.timestamp} mono />
            <Field label="Executed branch" value={t?.branch_id} mono />
            <Field label="Entity ID" value={t?.entity_id} mono />
            <Field label="SID" value={t?.sid} mono />
            <Field label="previous_hash" value={<HashChip value={t?.previous_hash} />} />
            <Field label="record_hash" value={<HashChip value={t?.record_hash} />} />
            <Field label="previous_state_hash" value={<HashChip value={t?.previous_state_hash} />} />
            <Field label="persisted_hash" value={<HashChip value={t?.persisted_hash} />} />
          </div>
        </Panel>

        <Panel eyebrow="Manifestation" title="Readiness state">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Capability" value={t?.execution_receipt?.capability} mono />
            <Field label="Receipt action" value={t?.execution_receipt?.action} mono />
            <Field label="Artifact" value={basename(t?.execution_receipt?.artifact)} mono />
            <Field label="Total bytes" value={t?.execution_receipt?.total_bytes} mono />
            <Field label="Artifact sha256" value={<HashChip value={t?.execution_receipt?.sha256} />} />
            <Field label="Persisted" value={t?.persisted === undefined ? undefined : String(t.persisted)} mono />
            <Field
              label="Unreal runtime status"
              value={undefined}
              className="sm:col-span-2"
            />
          </div>
          <p className="mt-3 font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
            Unreal / CAD runtime state is not part of the published contracts.
          </p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel eyebrow="Developmental state" title="Phenotype">
          <div className="space-y-3">
            <Field label="Cycles on active destiny" value={cycles} mono />
            <Field label="Destinies carried" value={Object.keys(operator?.destinies ?? {}).length || undefined} mono />
            <Field label="Meaning Elements held" value={operator?.me_ids?.length} mono />
            <Field label="Lineage depth" value={operator?.lineage?.length} mono />
            <Meter label="Executed branch confidence" value={executed?.confidence} />
          </div>
        </Panel>

        <Panel eyebrow="AutoSync" title="Verification status">
          <div className="space-y-3">
            <StatusPill label="Ledger valid" value={semantic.ledger_valid === undefined ? undefined : String(semantic.ledger_valid).toUpperCase()} />
            <Field label="Ledger entries" value={semantic.ledger_entries} mono />
            <Field label="Verified transitions" value={semantic.verified_transitions} mono />
            <Field label="State updated at" value={semantic.updated_at} mono />
            <Field label="World model state hash" value={<HashChip value={worldModel.state_hash} />} />
          </div>
        </Panel>

        <Panel eyebrow="Galaxy Bridge" title="Resonance & provenance">
          <div className="space-y-3">
            <Field label="Resonant relationships" value={worldModel.relationships?.length} mono />
            <Field label="Emergence candidates" value={worldModel.emergence_candidates?.length} mono />
            <Field label="Evidence records" value={Object.keys(data.evidence.evidence ?? {}).length || undefined} mono />
            <div>
              <p className="label-eyebrow mb-2">Bridge permissions</p>
              <Unavailable label="not published in state contracts" />
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
