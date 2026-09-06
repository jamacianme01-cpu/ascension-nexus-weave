import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Inspection layer. Every low-level governed value (hashes, receipts, IDs,
 * authority, provenance, constraint detail, unavailable fields) lives behind
 * one of these. Read-only: it only reveals published state, never mutates it.
 */
export function Inspect({
  label = "Inspect",
  note,
  children,
  defaultOpen = false,
  className,
}: {
  label?: string | undefined;
  note?: string | undefined;
  children: ReactNode;
  defaultOpen?: boolean | undefined;
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("mt-4", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "group flex w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors",
          open
            ? "border-gold/50 bg-gold/10 text-gold"
            : "border-border/70 text-muted-foreground hover:border-gold/40 hover:text-gold",
        )}
      >
        <span
          className={cn(
            "font-mono text-[0.6rem] transition-transform",
            open && "rotate-90",
          )}
        >
          ▸
        </span>
        <span className="font-mono text-[0.66rem] tracking-[0.24em] uppercase">{label}</span>
        {note && (
          <span className="ml-auto truncate font-mono text-[0.6rem] tracking-[0.14em] uppercase opacity-70">
            {note}
          </span>
        )}
      </button>
      {open && (
        <div className="relative mt-2 rounded-md border border-border/50 bg-void/60 p-3">
          <span className="gold-rule absolute inset-x-3 top-0 h-px opacity-50" />
          {children}
        </div>
      )}
    </div>
  );
}

/** Experience-layer stage caption used along the chamber flow. */
export function Stage({
  index,
  name,
  read,
  children,
  glyph,
}: {
  index: string;
  name: string;
  read?: ReactNode | undefined;
  children?: ReactNode | undefined;
  glyph?: ReactNode | undefined;
}) {
  return (
    <section className="relative">
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center pt-1">
          <span className="font-mono text-[0.6rem] tracking-[0.2em] text-gold/80">{index}</span>
          <span className="mt-2 size-2 rounded-full bg-primary photon-glow alive" />
          <span className="mt-2 w-px flex-1 bg-gradient-to-b from-primary/60 via-gold/30 to-transparent" />
        </div>
        <div className="min-w-0 flex-1 pb-8">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-etched font-display text-lg tracking-[0.18em] text-foreground uppercase sm:text-xl">
              {name}
            </h2>
            {read && <div className="text-sm text-muted-foreground">{read}</div>}
          </div>
          {glyph}
          {children}
        </div>
      </div>
    </section>
  );
}
