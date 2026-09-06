import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import {
  Field,
  List,
  Meter,
  PageHeader,
  Panel,
  Pill,
  StatusPill,
  Unavailable,
  verdictTone,
} from "@/components/ascension/chrome";
import { Inspect } from "@/components/ascension/inspect";
import { BranchFan, FlowLegend } from "@/components/ascension/flow";
import { ascensionStateQuery } from "@/lib/ascension/state";

export const Route = createFileRoute("/pathways")({
  head: () => ({
    meta: [
      { title: "DTF Pathways & Outcome Predictor — ASCENSION" },
      {
        name: "description",
        content:
          "Branch comparison, Outcome Predictor trajectory, confidence, contradictions, balance and Wisdom recommendation from published transition state.",
      },
      { property: "og:title", content: "DTF Pathways & Outcome Predictor — ASCENSION" },
      {
        property: "og:description",
        content:
          "Simulated DTF branches with predicted outcome, confidence, risks and Guardian verdict, read-only.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ascensionStateQuery),
  errorComponent: ({ error }) => (
    <p role="alert" className="font-mono text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => <p className="font-mono text-sm">No pathway state published.</p>,
  component: Pathways,
});

function Pathways() {
  const { data } = useSuspenseQuery(ascensionStateQuery);
  const t = data.chamber.last_transition;
  const branches = t?.branches ?? [];
  const executedId = t?.branch_id;
  const recommended = branches.find(
    (b) => b.status === "recommended" || b.evaluation?.recommended_by,
  );
  const best = branches.reduce<number | undefined>(
    (max, b) => Math.max(max ?? 0, b.evaluation?.outcome_predictor ?? 0),
    undefined,
  );

  return (
    <>
      <PageHeader
        eyebrow="Surface 03"
        title="Pathways · DTF / Transverse"
        intent="Branch comparison, trajectory effects, confidence, constraints, emergence points and balance evaluation."
        right={
          <div className="flex flex-wrap gap-2">
            <Pill tone="photon" glow>{branches.length} branches</Pill>
            <Pill tone="gold">{t?.destiny_id ?? "destiny unavailable"}</Pill>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel eyebrow="Wisdom" title="Recommendation" className="lg:col-span-2">
          {recommended ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="gold" glow>{recommended.approach ?? "approach unavailable"}</Pill>
                <span className="font-mono text-[0.72rem] text-foreground">
                  {recommended.branch_id}
                </span>
                <Pill tone="violet">
                  recommended by {recommended.evaluation?.recommended_by ?? "unavailable"}
                </Pill>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Meter label="Confidence" value={recommended.confidence} />
                <Meter label="Outcome predictor" value={recommended.evaluation?.outcome_predictor} />
                <Meter label="Maturity bonus" value={recommended.evaluation?.maturity_bonus} />
              </div>
              <Field
                label="Executed branch matches recommendation"
                mono
                value={executedId ? String(executedId === recommended.branch_id).toUpperCase() : undefined}
              />
            </div>
          ) : (
            <Unavailable label="wisdom recommendation" />
          )}
        </Panel>

        <Panel eyebrow="Dynamic balance" title="Evaluation">
          <div className="space-y-3">
            <Field
              label="Δ balance (accepted)"
              mono
              value={
                t?.accepted_delta
                  ? `K ${t.accepted_delta.K} · U ${t.accepted_delta.U} · W ${t.accepted_delta.W}`
                  : undefined
              }
            />
            <Field
              label="Proposed vs accepted"
              mono
              value={
                t?.proposed_delta && t?.accepted_delta
                  ? t.proposed_delta.K === t.accepted_delta.K &&
                    t.proposed_delta.U === t.accepted_delta.U &&
                    t.proposed_delta.W === t.accepted_delta.W
                    ? "NO ATTENUATION"
                    : "ATTENUATED"
                  : undefined
              }
            />
            <Meter label="Best predicted outcome" value={best} />
            <Field
              label="Contradiction load"
              mono
              value={branches.reduce((n, b) => n + (b.evaluation?.contradictions?.length ?? 0), 0)}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {branches.map((b) => {
          const executed = b.branch_id === executedId;
          return (
            <Panel
              key={b.branch_id}
              eyebrow={b.approach ?? "approach unavailable"}
              title={b.branch_id.split(":").pop() ?? b.branch_id}
              className={executed ? "photon-glow" : undefined}
              aside={
                <div className="flex flex-col items-end gap-1.5">
                  <Pill tone={verdictTone(b.status?.toUpperCase())}>{b.status ?? "status unavailable"}</Pill>
                  {executed && <Pill tone="photon" glow>executed</Pill>}
                </div>
              }
            >
              <div className="space-y-3">
                <Field label="Branch id" value={b.branch_id} mono />
                <Field label="Capability" value={b.capability} mono />
                <Meter label="Confidence" value={b.confidence} />
                <Meter label="Outcome predictor" value={b.evaluation?.outcome_predictor} />
                <Meter label="Maturity bonus" value={b.evaluation?.maturity_bonus} />
                <StatusPill label="Guardian" value={b.evaluation?.guardian} />
                <div>
                  <p className="label-eyebrow mb-2">Actions</p>
                  <List items={b.actions} />
                </div>
                <div>
                  <p className="label-eyebrow mb-2">Risks</p>
                  <List items={b.risks} tone="gold" />
                </div>
                <div>
                  <p className="label-eyebrow mb-2">Contradictions</p>
                  <List items={b.evaluation?.contradictions} tone="danger" />
                </div>
                <div>
                  <p className="label-eyebrow mb-2">Violations</p>
                  <List items={b.evaluation?.violations} tone="danger" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Expected artifact"
                    mono
                    value={b.expected?.artifact_name ?? b.expected?.artifact}
                  />
                  <Field label="Min bytes" mono value={b.expected?.min_bytes} />
                </div>
                <div>
                  <p className="label-eyebrow mb-2">Required sections</p>
                  <List items={b.expected?.required_sections} />
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel eyebrow="Trajectory" title="Outcome predictor comparison">
        {branches.length === 0 ? (
          <Unavailable label="branches" />
        ) : (
          <div className="space-y-3">
            {branches.map((b) => {
              const value = b.evaluation?.outcome_predictor;
              return (
                <div key={b.branch_id} className="glass-inset rounded-md px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[0.7rem] text-foreground">{b.branch_id}</span>
                    <span className="font-mono text-[0.72rem] text-primary">
                      {value === undefined ? "unavailable" : value.toFixed(4)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-void/70">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-photon-dim via-photon to-gold"
                      style={{ width: `${Math.min(100, (value ?? 0) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
