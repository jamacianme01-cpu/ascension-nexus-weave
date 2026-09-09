import { useSyncExternalStore, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  asAscensionError,
  getActiveSourceMode,
  getAscensionDataSource,
  subscribeActiveSourceMode,
  type ActiveSourceMode,
} from "@/lib/ascension/datasource";

/** Live subscription to which source the console is currently reading. */
export function useActiveSourceMode(): ActiveSourceMode {
  return useSyncExternalStore(
    subscribeActiveSourceMode,
    getActiveSourceMode,
    () => "unknown" as const,
  );
}

/**
 * Permanent, unmistakable notice that the console is showing bundled DEMO
 * fixtures because the governed gateway is unreachable. It is never shown while
 * LIVE_GOVERNED state is being read.
 */
export function DemoModeBanner() {
  const mode = useActiveSourceMode();
  if (mode !== "demo") return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="border-y-2 border-warn bg-warn/20 px-4 py-3 sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-display text-[0.8rem] font-bold tracking-[0.2em] text-warn uppercase sm:text-sm sm:tracking-[0.26em]">
          Demo mode — not live Ascension state
        </span>
        <span className="font-mono text-[0.66rem] tracking-[0.12em] text-warn/90 uppercase">
          Observation gateway unreachable · bundled fixtures shown · nothing is written
        </span>
      </div>
    </div>
  );
}


/**
 * Chamber-language states: loading, unavailable live source, malformed source,
 * stale source, integrity failure. Nothing here fabricates governed values;
 * each state names the missing or failing contract instead.
 */

function Frame({
  tone = "gold",
  eyebrow,
  title,
  children,
}: {
  tone?: "gold" | "photon" | "danger";
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  const ring =
    tone === "danger"
      ? "border-destructive/50"
      : tone === "photon"
        ? "border-primary/40"
        : "border-gold/40";
  const heading =
    tone === "danger" ? "text-destructive" : tone === "photon" ? "text-primary" : "text-gold";
  return (
    <section
      role="alert"
      aria-live="polite"
      className={cn("glass relative overflow-hidden rounded-lg border p-6 sm:p-8", ring)}
    >
      <span className="gold-rule absolute inset-x-6 top-0 h-px opacity-70" />
      <p className="label-eyebrow">{eyebrow}</p>
      <h2
        className={cn(
          "text-etched mt-2 font-display text-lg tracking-[0.16em] uppercase sm:text-2xl",
          heading,
        )}
      >
        {title}
      </h2>
      {children && <div className="mt-4 max-w-2xl space-y-3 text-sm text-muted-foreground">{children}</div>}
    </section>
  );
}

/** Crystalline loading state — a chamber charging, not a spinner. */
export function ChamberLoading({ surface }: { surface: string }) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="glass relative overflow-hidden rounded-lg p-6 sm:p-8"
    >
      <span className="gold-rule absolute inset-x-6 top-0 h-px opacity-70" />
      <p className="label-eyebrow">Ascension · reading published state</p>
      <h2 className="text-etched mt-2 font-display text-lg tracking-[0.18em] text-primary uppercase">
        {surface} charging
      </h2>
      <div className="mt-6 space-y-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="alive size-2 shrink-0 rounded-full bg-primary photon-glow" />
            <span
              className="h-2 flex-1 rounded-full bg-gradient-to-r from-primary/35 via-gold/20 to-transparent alive"
              style={{ animationDelay: `${i * 0.35}s`, maxWidth: `${92 - i * 14}%` }}
            />
          </div>
        ))}
      </div>
      <p className="mt-6 font-mono text-[0.62rem] tracking-[0.22em] text-muted-foreground uppercase">
        Observation only · no state is written
      </p>
    </section>
  );
}

/** Live gateway absent, or a source that failed. Never a demo-state fallback. */
export function SourceFailure({ error, surface }: { error: unknown; surface: string }) {
  const known = asAscensionError(error);
  const source = getAscensionDataSource();
  const message = error instanceof Error ? error.message : String(error);

  if (known?.code === "LIVE_GATEWAY_NOT_CONFIGURED") {
    return (
      <Frame eyebrow="Ascension · live source" title="Live ascension state unavailable">
        <p>
          The Observation Gateway is not configured, so no live ASCENSION state can be read for the{" "}
          {surface} surface.
        </p>
        <p>
          Demo state is deliberately <span className="text-gold">not</span> substituted: fixtures may
          never stand in for governed live state.
        </p>
        <p className="font-mono text-[0.68rem] text-gold/80">LIVE_GATEWAY_NOT_CONFIGURED</p>
      </Frame>
    );
  }

  if (known?.code === "MALFORMED_SOURCE") {
    return (
      <Frame tone="danger" eyebrow="Ascension · source integrity" title="Malformed source contract">
        <p>{known.message}</p>
        {known.detail && <p className="font-mono text-[0.68rem] text-destructive/90">{known.detail}</p>}
      </Frame>
    );
  }

  return (
    <Frame tone="danger" eyebrow="Ascension · read failure" title="Source could not be read">
      <p>{message}</p>
      <p className="font-mono text-[0.68rem] text-muted-foreground">
        source: {source.mode} · {source.label}
      </p>
    </Frame>
  );
}

/** Integrity failure banner, e.g. a broken hash-chain link. */
export function IntegrityFailure({ what, detail }: { what: string; detail?: string | undefined }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3"
    >
      <span className="font-mono text-[0.62rem] tracking-[0.22em] text-destructive uppercase">
        Integrity failure
      </span>
      <span className="text-sm text-foreground">{what}</span>
      {detail && <span className="font-mono text-[0.66rem] text-destructive/90">{detail}</span>}
    </div>
  );
}

/** Stale-source notice: state was read, but its publication moment has aged. */
export function StaleSource({ updatedAt }: { updatedAt?: string | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-warn/40 bg-warn/10 px-4 py-2.5">
      <span className="font-mono text-[0.62rem] tracking-[0.22em] text-warn uppercase">
        Stale source
      </span>
      <span className="text-[0.82rem] text-muted-foreground">
        Published state has not changed since {updatedAt ?? "an unavailable timestamp"}.
      </span>
    </div>
  );
}

/** Always-visible provenance of the current data source. */
export function SourceBadge({ className }: { className?: string | undefined }) {
  const source = getAscensionDataSource();
  const mode = useActiveSourceMode();
  const live = mode === "live";
  const label = mode === "live" ? "live governed" : mode === "demo" ? "demo state" : "reading source";
  return (
    <span
      title={source.label}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 font-mono text-[0.6rem] tracking-[0.2em] uppercase",
        live ? "border-primary/50 bg-primary/10 text-primary" : "border-warn/60 bg-warn/15 text-warn",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", live ? "bg-primary alive" : "bg-warn")}
      />
      {label}
    </span>
  );
}
