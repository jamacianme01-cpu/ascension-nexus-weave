import { Fragment } from "react";

import { Field, HashChip, Panel, Pill, Unavailable } from "@/components/ascension/chrome";
import { Inspect } from "@/components/ascension/inspect";
import { cn } from "@/lib/utils";
import type { LiveObservation } from "@/lib/ascension/gateway";
import type { Json, SurfaceResponse } from "@/lib/ascension/observation-v1";

/**
 * Live-gateway presentation. Read-only projection of the governed publication:
 * classification, revision, hashes, published forms and per-surface payloads.
 * Nothing here computes an alternative semantic truth — values are shown as
 * published, or as "unavailable".
 */

const classificationTone = (value: string) =>
  value === "LIVE_GOVERNED"
    ? "border-primary/50 bg-primary/10 text-primary"
    : value === "LIVE_CONTROLLER"
      ? "border-warn/50 bg-warn/10 text-warn"
      : "border-gold/50 bg-gold/10 text-gold";

/** Always-visible governed provenance strip. */
export function LiveProvenance({ live }: { live: LiveObservation }) {
  return (
    <section className="glass crystal-frame relative rounded-lg px-5 py-4">
      <span className="gold-rule absolute inset-x-4 top-0 h-px opacity-70" />
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 font-mono text-[0.62rem] tracking-[0.2em] uppercase",
            classificationTone(live.sourceClassification),
          )}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current alive" />
          {live.sourceClassification}
        </span>
        <Pill tone={live.availability === "available" ? "photon" : "gold"}>
          availability · {live.availability}
        </Pill>
        <Pill tone="gold">
          publication revision {live.publicationRevision ?? live.snapshotRevision ?? "unavailable"}
        </Pill>
        <span className="font-mono text-[0.62rem] tracking-[0.16em] text-muted-foreground uppercase">
          content hash
        </span>
        <HashChip value={live.contentHash} label="content_hash" />
        <span className="font-mono text-[0.62rem] tracking-[0.16em] text-muted-foreground uppercase">
          snapshot hash
        </span>
        <HashChip value={live.snapshotHash} label="snapshot_hash" />
      </div>
      {live.availability === "last_verified" && (
        <p className="mt-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[0.8rem] text-muted-foreground">
          Retained last verified publication — this is historical governed state, not a fresh commit.
          {live.error ? ` Gateway note: ${live.error}` : ""}
        </p>
      )}
      <Inspect label="Inspect publication provenance" note="/api/ascension/v1/snapshot">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Knowledgeverse id" value={live.knowledgeverseId} mono />
          <Field label="Published at" value={live.publishedAt} mono />
          <Field label="Snapshot generated at" value={live.generatedAt} mono />
          <Field label="Gateway" value={live.gatewayUrl} mono />
          <Field label="Gateway error" value={live.error ?? undefined} mono />
        </div>
        <div className="mt-3">
          <JsonView value={(live.provenance ?? null) as Json} />
        </div>
      </Inspect>
    </section>
  );
}

/** The separate LIVE_CONTROLLER read — never merged into a governed revision. */
export function LiveController({ live }: { live: LiveObservation }) {
  const controller = live.controller;
  return (
    <Panel eyebrow="Unreal controller · separate source" title="LIVE_CONTROLLER state">
      {!controller ? (
        <Unavailable label="controller not read on this surface" />
      ) : controller.availability !== "available" ? (
        <div className="space-y-2">
          <Pill tone="gold">UNAVAILABLE</Pill>
          <p className="font-mono text-[0.68rem] text-muted-foreground">
            {controller.error ?? "controller state unavailable"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full border px-2.5 py-0.5 font-mono text-[0.62rem] tracking-[0.2em] uppercase",
                classificationTone(controller.source_classification),
              )}
            >
              {controller.source_classification}
            </span>
            <Pill tone="gold">source_integrity · {controller.source_integrity}</Pill>
            <Pill tone="gold">coherent_with_snapshot · false</Pill>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Availability" value={controller.availability} mono />
            <Field label="Source revision" value={undefined} mono />
            <Field label="Source hash" value={<HashChip value={controller.source_hash} />} />
            <Field label="Generated at" value={controller.generated_at} mono />
          </div>
          <p className="font-mono text-[0.62rem] leading-relaxed text-muted-foreground">
            Unversioned and unverified controller state. It carries no authenticated producer
            revision, is not ordered against governed publications, and is never counted as
            governed truth.
          </p>
          <Inspect label="Inspect controller payload" note="/api/ascension/v1/chamber">
            <JsonView value={(controller.data ?? null) as Json} />
          </Inspect>
        </div>
      )}
    </Panel>
  );
}

/** Published Knowledge Forms exactly as the contract defines them. */
export function LiveForms({ live }: { live: LiveObservation }) {
  if (live.forms.length === 0) return <Unavailable label="knowledge_forms" />;
  return (
    <div className="space-y-4">
      {live.forms.map((form) => (
        <Panel
          key={form.entity_id}
          eyebrow="Published Knowledge Form"
          title={form.entity_id}
          aside={<Pill tone="violet">{form.developmental_state}</Pill>}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Persistent entity id" value={form.persistent_entity_id} mono />
            <Field label="SID" value={form.sid} mono />
            <Field
              label="Destiny id"
              value={typeof form.destiny_id === "string" ? form.destiny_id : undefined}
              mono
            />
            <Field
              label="Objective id"
              value={typeof form.objective_id === "string" ? form.objective_id : undefined}
              mono
            />
            <Field
              label="Emergence detected"
              value={form.emergence_detected === null ? undefined : String(form.emergence_detected)}
              mono
            />
            <Field
              label="DTF / Transverse available"
              value={
                form.dtf_transverse_available === null
                  ? undefined
                  : String(form.dtf_transverse_available)
              }
              mono
            />
          </div>
          <Inspect label="Inspect Library Card record" note="published form projection">
            <div className="space-y-3">
              {(
                [
                  ["chromosome / genesis", form.chromosome],
                  ["phenotype / developmental state", form.phenotype],
                  ["active meaning elements", form.active_meaning_elements],
                  ["key relationships", form.key_relationships],
                  ["lineage", form.lineage],
                  ["verified Δ", form.verified_delta],
                  ["manifestation readiness", form.manifestation_readiness],
                  ["environment context", form.environment_context],
                  ["library card reference", form.library_card_reference],
                ] as [string, Json][]
              ).map(([label, value]) => (
                <div key={label}>
                  <p className="label-eyebrow mb-1">{label}</p>
                  <JsonView value={value} />
                </div>
              ))}
            </div>
          </Inspect>
        </Panel>
      ))}
    </div>
  );
}

/** One documented surface response, shown as published. */
export function LiveSurface({
  title,
  eyebrow,
  response,
  path,
}: {
  title: string;
  eyebrow: string;
  response?: SurfaceResponse | undefined;
  path: string;
}) {
  return (
    <Panel
      eyebrow={eyebrow}
      title={title}
      aside={
        response ? (
          <Pill tone={response.availability === "available" ? "photon" : "gold"}>
            {response.availability}
          </Pill>
        ) : undefined
      }
    >
      {!response ? (
        <Unavailable label={path} />
      ) : response.data === null ? (
        <div className="space-y-2">
          <Unavailable label={`${path} · not published`} />
          {response.error && (
            <p className="font-mono text-[0.66rem] text-muted-foreground">{response.error}</p>
          )}
        </div>
      ) : (
        <>
          <JsonView value={response.data as Json} />
          <p className="mt-3 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
            {path} · revision {response.snapshot_revision ?? "unavailable"}
          </p>
        </>
      )}
    </Panel>
  );
}

/** Governed ledger read: ledger_valid may be null by contract. */
export function LiveLedger({ live }: { live: LiveObservation }) {
  const ledger = live.ledger;
  return (
    <Panel eyebrow="Governed closure ledger" title="Verified Δ records">
      {!ledger ? (
        <Unavailable label="/api/ascension/v1/ledger" />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Entry count" value={ledger.entry_count ?? undefined} mono />
            <Field
              label="Ledger valid"
              value={ledger.ledger_valid === null ? undefined : String(ledger.ledger_valid)}
              mono
            />
            <Field label="Latest record hash" value={<HashChip value={ledger.latest_record_hash} />} />
            <Field label="Broken index" value={ledger.broken_index ?? undefined} mono />
          </div>
          {ledger.ledger_valid === null && (
            <p className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 font-mono text-[0.66rem] text-gold/90">
              ledger_valid is null — {ledger.error ?? "closure_ledger_has_no_hash_chain"}. No chain
              validity is claimed here.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Governed state, verbatim, behind the inspection layer. */
export function LiveGovernedState({ live }: { live: LiveObservation }) {
  return (
    <Panel eyebrow="Governed publication" title="Committed governed state">
      {live.governedState ? (
        <Inspect label="Inspect governed state" note="snapshot.content.governed_state" defaultOpen>
          <JsonView value={live.governedState as Json} />
        </Inspect>
      ) : (
        <Unavailable label="governed_state" />
      )}
    </Panel>
  );
}

/** Generic published-value renderer: no key is renamed, added or defaulted. */
export function JsonView({ value, depth = 0 }: { value: Json; depth?: number }) {
  if (value === null) return <Unavailable />;
  if (typeof value !== "object") {
    return (
      <span className="font-mono text-[0.74rem] break-words text-foreground">{String(value)}</span>
    );
  }
  const entries: [string, Json][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);
  if (entries.length === 0) return <Unavailable label="empty" />;
  return (
    <dl
      className={cn(
        "space-y-1.5",
        depth > 0 && "mt-1 border-l border-border/50 pl-3",
      )}
    >
      {entries.map(([key, child]) => (
        <Fragment key={key}>
          <div className="grid gap-x-3 sm:grid-cols-[minmax(9rem,14rem)_1fr]">
            <dt className="font-mono text-[0.64rem] tracking-[0.12em] break-words text-gold/80 uppercase">
              {key}
            </dt>
            <dd className="min-w-0">
              <JsonView value={child} depth={depth + 1} />
            </dd>
          </div>
        </Fragment>
      ))}
    </dl>
  );
}
