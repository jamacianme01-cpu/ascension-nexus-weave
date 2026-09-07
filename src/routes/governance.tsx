import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import {
  Field,
  HashChip,
  List,
  Meter,
  PageHeader,
  Panel,
  Pill,
  StatusPill,
  Unavailable,
} from "@/components/ascension/chrome";
import { ChamberLoading, SourceFailure } from "@/components/ascension/states";
import { Inspect } from "@/components/ascension/inspect";
import { LiveProvenance, LiveSurface } from "@/components/ascension/live";
import { FlowLegend } from "@/components/ascension/flow";
import { surfaceQuery, basename } from "@/lib/ascension/state";
import type { ConstraintRecord } from "@/lib/ascension/contracts";

export const Route = createFileRoute("/governance")({
  head: () => ({
    meta: [
      { title: "Governance, Constraints & Provenance — ASCENSION" },
      {
        name: "description",
        content:
          "Active, applicable, remembered-not-applicable and superseded constraints with Guardian state and evidence provenance.",
      },
      { property: "og:title", content: "Governance, Constraints & Provenance — ASCENSION" },
      {
        property: "og:description",
        content:
          "Constraint governance and evidence basis for the last verified ASCENSION transition, read-only.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(surfaceQuery("governance")),
  errorComponent: ({ error }) => <SourceFailure error={error} surface="Governance" />,
  pendingComponent: () => <ChamberLoading surface="Governance" />,
  notFoundComponent: () => <p className="font-mono text-sm">No governance state published.</p>,
  component: Governance,
});

function ConstraintCard({ c }: { c: ConstraintRecord }) {
  const status = (c.status ?? "").toLowerCase();
  const tone =
    status === "active" ? "photon" : status === "superseded" ? "violet" : status ? "gold" : "neutral";
  return (
    <div
      className={
        "glass-inset relative overflow-hidden rounded-md px-3 py-3 " +
        (status === "active" ? "border-l-2 border-l-primary/70" : "border-l-2 border-l-gold/40")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pill tone={tone} glow={status === "active"}>
          {c.status ?? "status unavailable"}
        </Pill>
        {c.confidence !== undefined && (
          <span className="font-mono text-[0.65rem] text-primary">
            confidence {c.confidence.toFixed(2)}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{c.meaning ?? <Unavailable />}</p>
      <Inspect label="Inspect constraint" note={c.constraint_id}>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Constraint id" value={c.constraint_id} mono />
          <Field label="Authority" value={c.authority} mono />
          <Field label="Source destiny" value={c.source_destiny_id} mono />
          <Field label="Banned tokens" value={c.banned_tokens?.join(" · ")} mono />
          <Field label="Scope subject" value={c.scope_subject?.join(" · ")} mono />
          <Field label="Scope domain tokens" value={c.scope_domain_tokens?.join(" · ")} mono />
          <Field label="Broad" value={c.broad === undefined ? undefined : String(c.broad)} mono />
          <Field label="Created at" value={c.created_at} mono />
          <Field label="Superseded by" value={c.superseded_by ?? undefined} mono />
          <Field label="Evidence transition" value={c.evidence_transition ?? undefined} mono />
          <Field label="Applicability reason" value={c.applicability_reason} mono />
        </div>
        {c.confidence !== undefined && (
          <div className="mt-2">
            <Meter label="Confidence" value={c.confidence} />
          </div>
        )}
      </Inspect>
    </div>
  );
}


function Governance() {
  const { data } = useSuspenseQuery(surfaceQuery("governance"));
  const registry = Object.values(data.constraints.constraints ?? {});
  const t = data.chamber.last_transition;
  const gov = data.semantic.transition?.constraint_governance ?? t?.constraint_governance;
  const executed = t?.branches?.find((b) => b.branch_id === t?.branch_id);
  const evidence = Object.values(data.evidence.evidence ?? {});

  return (
    <>
      {data.live && <LiveProvenance live={data.live} />}
      <PageHeader
        eyebrow="Surface 04"
        title="Governance"
        intent="Constraint registry, applicability decisions, Guardian state and the evidence basis behind verification."
        right={<Pill tone="gold" glow>{registry.length} constraints</Pill>}
      />

      <FlowLegend steps={["Guardian", "Constraints", "Applicability", "Evidence", "Verdict"]} />

      <section className="glass relative overflow-hidden rounded-lg px-5 py-8 sm:px-8">
        <div className="gold-rule absolute inset-x-6 top-0 h-px opacity-70" />
        <p className="label-eyebrow">Guardian · protective law</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span
            className={
              "text-etched font-display text-3xl tracking-[0.2em] uppercase sm:text-4xl " +
              (executed?.evaluation?.guardian === "PASS" ? "text-primary" : "text-gold")
            }
          >
            {executed?.evaluation?.guardian ?? "unavailable"}
          </span>
          <Pill tone="gold">{t?.outcome_status ?? "outcome unavailable"}</Pill>
          <Pill tone="violet">{registry.length} constraints held</Pill>
        </div>
        <Inspect label="Inspect Guardian decision" note="authority · branch · rejection">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusPill label="Verdict" value={executed?.evaluation?.guardian} />
            <StatusPill label="Outcome" value={t?.outcome_status ?? undefined} />
            <Field label="Authority" value={t?.authority} mono />
            <Field label="Evaluated branch" value={t?.branch_id} mono />
            <Field label="Rejection reason" value={t?.rejection_reason ?? undefined} mono />
            <Field label="Rejection detail" value={t?.rejection_reason_extra ?? undefined} mono />
          </div>
        </Inspect>
      </section>

      <div className="grid gap-5">
        <Panel eyebrow="Registry" title="Active constraints">
          {registry.length === 0 ? (
            <Unavailable label="constraints" />
          ) : (
            <div className="grid gap-3">
              {registry.map((c) => (
                <ConstraintCard key={c.constraint_id} c={c} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {(
          [
            ["Applicable", gov?.applicable],
            ["Remembered · not applicable", gov?.remembered_not_applicable],
            ["Superseded", gov?.superseded],
          ] as const
        ).map(([label, list]) => (
          <Panel key={label} eyebrow="Constraint governance" title={label}>
            {!list || list.length === 0 ? (
              <Unavailable label="none published for this transition" />
            ) : (
              <div className="grid gap-3">
                {list.map((c) => (
                  <ConstraintCard key={c.constraint_id} c={c} />
                ))}
              </div>
            )}
          </Panel>
        ))}
      </div>

      <Panel eyebrow="Provenance" title="Evidence basis">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="glass-inset rounded-md px-3 py-3">
            <p className="label-eyebrow">Observed evidence · last transition</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Field label="Evidence id" value={t?.observed_evidence?.evidence_id} mono />
              <Field label="Kind" value={t?.observed_evidence?.kind} mono />
              <Field label="Captured at" value={t?.observed_evidence?.captured_at} mono />
              <Field label="Size bytes" value={t?.observed_evidence?.size_bytes} mono />
              <Field label="Artifact" value={basename(t?.observed_evidence?.artifact_path)} mono />
              <Field label="sha256" value={<HashChip value={t?.observed_evidence?.sha256} />} />
            </div>
            <div className="mt-3">
              <p className="label-eyebrow mb-2">Verification mismatches</p>
              <List items={t?.verification?.mismatches} tone="danger" />
            </div>
          </div>

          <div className="space-y-3">
            {evidence.length === 0 ? (
              <Unavailable label="evidence registry" />
            ) : (
              evidence.map((e) => (
                <div key={e.evidence_id} className="glass-inset rounded-md px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[0.68rem] text-gold/85">{e.evidence_id}</span>
                    <Pill tone="photon">{e.independence ?? "independence unavailable"}</Pill>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Field label="Observer" value={e.observer} mono />
                    <Field label="Method" value={e.method} mono />
                    <Field label="Measurement" value={e.measurement} mono />
                    <Field label="Source" value={e.source} mono />
                    <Field label="Target" value={basename(e.target)} mono />
                    <Field label="Size bytes" value={e.size_bytes} mono />
                    <Field label="Timestamp" value={e.timestamp} mono />
                    <Field label="Artifact sha256" value={<HashChip value={e.artifact_sha256} />} />
                    <Field
                      label="Transitions supported"
                      className="sm:col-span-2"
                      mono
                      value={e.transitions_supported?.length ? e.transitions_supported.join(" · ") : undefined}
                    />
                  </div>
                  {e.confidence !== undefined && (
                    <div className="mt-2">
                      <Meter label="Confidence" value={e.confidence} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Panel>

      {data.live && (
        <div className="grid gap-5 lg:grid-cols-2">
          <LiveSurface
            eyebrow="Guardian · AutoSync"
            title="Recorded governance results"
            path="/api/ascension/v1/governance"
            response={data.live.surfaces["governance"]}
          />
          <LiveSurface
            eyebrow="Galaxy Bridge"
            title="Linked publisher"
            path="/api/ascension/v1/galaxy-bridges"
            response={data.live.surfaces["galaxy-bridges"]}
          />
        </div>
      )}
    </>
  );
}
