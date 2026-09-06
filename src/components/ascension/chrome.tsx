import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { Delta } from "@/lib/ascension/contracts";
import { shortHash } from "@/lib/ascension/state";

export function Panel({
  eyebrow,
  title,
  aside,
  children,
  className,
}: {
  eyebrow?: string | undefined;
  title?: string | undefined;
  aside?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("glass crystal-frame relative rounded-lg transition-shadow duration-300", className)}>
      <div className="gold-rule absolute inset-x-4 top-0 h-px opacity-70" />
      {(eyebrow || title || aside) && (
        <header className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
          <div>
            {eyebrow && <p className="label-eyebrow">{eyebrow}</p>}
            {title && (
              <h2 className="text-etched mt-1 text-lg text-foreground uppercase">{title}</h2>
            )}
          </div>
          {aside}
        </header>
      )}
      <div className="px-5 pb-5 pt-4">{children}</div>
    </section>
  );
}

export function Unavailable({ label }: { label?: string | undefined }) {
  return (
    <span className="font-mono text-xs tracking-wide text-muted-foreground/70 italic">
      unavailable{label ? ` · ${label}` : ""}
    </span>
  );
}

export function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value?: ReactNode | undefined;
  mono?: boolean | undefined;
  className?: string | undefined;
}) {
  const empty = value === undefined || value === null || value === "";
  return (
    <div className={cn("glass-inset rounded-md px-3 py-2.5", className)}>
      <p className="label-eyebrow">{label}</p>
      <div
        className={cn(
          "mt-1.5 text-sm break-words text-foreground",
          mono && "font-mono text-[0.78rem] leading-relaxed",
        )}
      >
        {empty ? <Unavailable /> : value}
      </div>
    </div>
  );
}

type Tone = "photon" | "gold" | "violet" | "danger" | "neutral";

const toneClass: Record<Tone, string> = {
  photon: "border-primary/45 text-primary bg-primary/10",
  gold: "border-gold/45 text-gold bg-gold/10",
  violet: "border-violet-flux/45 text-violet-flux bg-violet-flux/10",
  danger: "border-destructive/50 text-destructive bg-destructive/10",
  neutral: "border-border text-muted-foreground bg-muted/40",
};

export function Pill({
  children,
  tone = "neutral",
  glow,
  className,
}: {
  children: ReactNode;
  tone?: Tone | undefined;
  glow?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.65rem] tracking-[0.16em] uppercase",
        toneClass[tone],
        glow && tone === "photon" && "photon-glow",
        glow && tone === "gold" && "gold-glow",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function verdictTone(value?: string | undefined): Tone {
  const v = value?.toUpperCase() ?? "";
  if (["PASS", "ACCEPTED", "VERIFIED", "TRUE"].includes(v)) return "photon";
  if (["FAIL", "REJECTED", "MISMATCH", "FALSE"].includes(v)) return "danger";
  return "gold";
}

export function StatusPill({ label, value }: { label: string; value?: string | undefined }) {
  return (
    <div className="flex items-center gap-2">
      <span className="label-eyebrow">{label}</span>
      {value ? <Pill tone={verdictTone(value)} glow>{value}</Pill> : <Unavailable />}
    </div>
  );
}

export function HashChip({ value, label }: { value?: string | null | undefined; label?: string | undefined }) {
  if (!value) return <Unavailable label={label} />;
  return (
    <span
      title={value}
      className="inline-flex items-center rounded-sm border border-border/70 bg-void/60 px-2 py-0.5 font-mono text-[0.7rem] text-gold/90"
    >
      {shortHash(value)}
    </span>
  );
}

const deltaMeta = {
  K: { name: "Knowledge", tone: "text-primary", bar: "bg-primary" },
  U: { name: "Understanding", tone: "text-violet-flux", bar: "bg-violet-flux" },
  W: { name: "Wisdom", tone: "text-gold", bar: "bg-gold" },
} as const;

export function DeltaMeters({ delta, max }: { delta?: Delta | undefined; max?: number | undefined }) {
  if (!delta) return <Unavailable label="delta" />;
  const ceiling = max ?? Math.max(delta.K, delta.U, delta.W, 1);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {(["K", "U", "W"] as const).map((key) => {
        const meta = deltaMeta[key];
        const value = delta[key];
        return (
          <div key={key} className="glass-inset rounded-md px-3 py-3">
            <div className="flex items-baseline justify-between">
              <span className={cn("font-display text-2xl", meta.tone)}>Δ{key}</span>
              <span className="font-mono text-xl text-foreground">{value}</span>
            </div>
            <p className="label-eyebrow mt-1">{meta.name}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-void/70">
              <div
                className={cn("h-full rounded-full", meta.bar)}
                style={{ width: `${Math.min(100, (value / ceiling) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Meter({ label, value }: { label: string; value?: number | undefined }) {
  return (
    <div className="glass-inset rounded-md px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="label-eyebrow">{label}</span>
        <span className="font-mono text-sm text-foreground">
          {value === undefined ? <Unavailable /> : value.toFixed(4).replace(/0+$/, "0")}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-void/70">
        <div
          className="h-full rounded-full bg-gradient-to-r from-photon-dim to-photon"
          style={{ width: `${Math.min(100, Math.max(0, (value ?? 0) * 100))}%` }}
        />
      </div>
    </div>
  );
}

export function List({ items, tone = "photon" }: { items?: string[] | undefined; tone?: Tone | undefined }) {
  if (!items || items.length === 0) return <Unavailable />;
  const dot =
    tone === "danger" ? "bg-destructive" : tone === "gold" ? "bg-gold" : "bg-primary";
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-[0.82rem] leading-relaxed text-muted-foreground">
          <span className={cn("mt-1.5 size-1 shrink-0 rounded-full", dot)} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function PageHeader({
  eyebrow,
  title,
  intent,
  right,
}: {
  eyebrow: string;
  title: string;
  intent?: string | undefined;
  right?: ReactNode | undefined;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-5">
      <div>
        <p className="label-eyebrow">{eyebrow}</p>
        <h1 className="text-etched mt-2 text-2xl text-foreground uppercase sm:text-3xl">{title}</h1>
        {intent && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{intent}</p>}
      </div>
      {right}
    </div>
  );
}
