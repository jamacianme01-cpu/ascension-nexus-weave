import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import {
  Field,
  HashChip,
  List,
  PageHeader,
  Panel,
  Pill,
  StatusPill,
  Unavailable,
} from "@/components/ascension/chrome";
import { ChamberLoading, IntegrityFailure, SourceFailure } from "@/components/ascension/states";
import { Inspect } from "@/components/ascension/inspect";
import { LiveLedger, LiveProvenance } from "@/components/ascension/live";
import { surfaceQuery, basename, chainLinkIntact } from "@/lib/ascension/state";

export const Route = createFileRoute("/ledger")({
  head: () => ({
    meta: [
      { title: "Verified Δ Ledger — ASCENSION" },
      {
        name: "description",
        content:
          "Hash-chained transition ledger: previous_hash to record_hash continuity, execution receipts, verification state and transformation history.",
      },
      { property: "og:title", content: "Verified Δ Ledger — ASCENSION" },
      {
        property: "og:description",
        content:
          "Every verified ASCENSION transition with hash-chain continuity, receipts and accepted deltas, read-only.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(surfaceQuery("ledger")),
  errorComponent: ({ error }) => <SourceFailure error={error} surface="Verified Δ ledger" />,
  pendingComponent: () => <ChamberLoading surface="Verified Δ ledger" />,
  notFoundComponent: () => <p className="font-mono text-sm">No ledger published.</p>,
  component: Ledger,
});

function Ledger() {
  const { data } = useSuspenseQuery(surfaceQuery("ledger"));
  const ledger = data.ledger;
  const intact = ledger.every((record, i) => chainLinkIntact(ledger[i - 1], record));

  return (
    <>
      <PageHeader
        eyebrow="Surface 05"
        title="Verified Δ Ledger"
        intent="Hash-chain continuity, execution receipts, verification state and transformation history."
        right={
          <div className="flex flex-wrap gap-2">
            <Pill tone={intact ? "photon" : "danger"} glow>
              {intact ? "chain intact" : "chain broken"}
            </Pill>
            <Pill tone="gold">{ledger.length} records</Pill>
          </div>
        }
      />

      {!intact && (
        <IntegrityFailure
          what="Hash-chain continuity broken in the published ledger."
          detail="a record's previous_hash does not equal the prior record_hash"
        />
      )}

      <div className="space-y-5">
        {ledger.map((record, i) => {
          const linked = chainLinkIntact(ledger[i - 1], record);
          return (
            <Panel
              key={record.transition_id ?? i}
              eyebrow={record.timestamp ?? "timestamp unavailable"}
              title={record.transition_id ?? "transition unavailable"}
              aside={
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={linked ? "photon" : "danger"}>
                    {linked ? "link verified" : "link mismatch"}
                  </Pill>
                  <Pill tone={record.outcome_status === "ACCEPTED" ? "photon" : "gold"}>
                    {record.outcome_status ?? "outcome unavailable"}
                  </Pill>
                </div>
              }
            >
              <div className="-mx-1 flex snap-x items-center gap-3 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible">
                {[
                  ["State", record.previous_state_hash ? "carried" : undefined],
                  ["Event", record.branch_id?.split(":").pop()],
                  ["Evidence", record.observed_evidence?.evidence_id ?? undefined],
                  ["Verification", record.verification?.result],
                  [
                    "Verified Δ",
                    record.accepted_delta
                      ? `K ${record.accepted_delta.K} · U ${record.accepted_delta.U} · W ${record.accepted_delta.W}`
                      : record.delta_k !== undefined
                        ? `K ${record.delta_k} · U ${record.delta_u} · W ${record.delta_w}`
                        : undefined,
                  ],
                  ["New state", record.persisted_hash ? "persisted" : undefined],
                ].map(([label, value], step) => (
                  <span key={String(label)} className="flex shrink-0 snap-start items-center gap-3">
                    {step > 0 && <span className="font-mono text-xs text-gold/70">→</span>}
                    <span className="glass-inset rounded-md px-3 py-2">
                      <span className="label-eyebrow block">{String(label)}</span>
                      <span className="mt-1 block font-mono text-[0.72rem] text-primary">
                        {value ? String(value) : <Unavailable />}
                      </span>
                    </span>
                  </span>
                ))}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Destiny" value={record.destiny} />
                <Field label="Executed branch" value={record.branch_id} mono />
                <StatusPill label="Verification" value={record.verification?.result} />
              </div>

              <Inspect label="Inspect record" note="hashes · receipt · evidence · authority">
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-sm border border-border/50 px-3 py-3">
                    <p className="label-eyebrow">Chain</p>
                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="label-eyebrow">previous_hash</p>
                        <HashChip value={record.previous_hash} />
                      </div>
                      <p className="text-center font-mono text-xs text-primary">↓</p>
                      <div>
                        <p className="label-eyebrow">record_hash</p>
                        <HashChip value={record.record_hash} />
                      </div>
                      <div className="pt-1">
                        <p className="label-eyebrow">previous_state_hash</p>
                        <HashChip value={record.previous_state_hash} />
                      </div>
                      <div className="pt-1">
                        <p className="label-eyebrow">persisted_hash</p>
                        <HashChip value={record.persisted_hash} />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-sm border border-border/50 px-3 py-3">
                    <p className="label-eyebrow">Transformation</p>
                    <div className="mt-3 grid gap-2">
                      <Field label="Entity ID" value={record.entity_id} mono />
                      <Field label="SID" value={record.sid} mono />
                      <Field label="Authority" value={record.authority} mono />
                      <Field
                        label="Proposed Δ"
                        mono
                        value={
                          record.proposed_delta
                            ? `K ${record.proposed_delta.K} · U ${record.proposed_delta.U} · W ${record.proposed_delta.W}`
                            : undefined
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-sm border border-border/50 px-3 py-3">
                    <p className="label-eyebrow">Execution receipt & evidence</p>
                    <div className="mt-3 grid gap-2">
                      <Field label="Capability" value={record.execution_receipt?.capability} mono />
                      <Field label="Action" value={record.execution_receipt?.action} mono />
                      <Field label="Artifact" value={basename(record.execution_receipt?.artifact)} mono />
                      <Field
                        label="Bytes"
                        value={record.execution_receipt?.total_bytes ?? record.execution_receipt?.bytes}
                        mono
                      />
                      <Field label="Receipt sha256" value={<HashChip value={record.execution_receipt?.sha256} />} />
                      <Field label="Evidence id" value={record.observed_evidence?.evidence_id} mono />
                      <Field label="Evidence sha256" value={<HashChip value={record.observed_evidence?.sha256} />} />
                      <div>
                        <p className="label-eyebrow mb-2">Mismatches</p>
                        <List items={record.verification?.mismatches} tone="danger" />
                      </div>
                    </div>
                  </div>
                </div>
              </Inspect>

            </Panel>
          );
        })}
      </div>
    </>
  );
}
