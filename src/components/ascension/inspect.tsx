import { useId, useState, type ReactNode } from "react";

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
  const panelId = useId();
  return (
    <div className={cn("mt-5", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "group flex min-h-10 w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-all duration-200",
          open
            ? "border-gold/55 bg-gold/10 text-gold gold-glow"
            : "border-border/70 text-muted-foreground hover:border-gold/45 hover:bg-gold/5 hover:text-gold",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "font-mono text-[0.6rem] transition-transform duration-200",
            open && "rotate-90",
          )}
        >
          ▸
        </span>
        <span className="min-w-0 font-mono text-[0.62rem] tracking-[0.2em] uppercase sm:text-[0.66rem] sm:tracking-[0.24em]">
          {label}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[0.58rem] tracking-[0.16em] uppercase opacity-70">
          {open ? "hide" : "inspection layer"}
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          className="inspection-layer animate-in fade-in slide-in-from-top-1 relative mt-2 rounded-md p-3 duration-200 sm:p-4"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border/40 pb-2">
            <span className="font-mono text-[0.56rem] tracking-[0.24em] text-gold/70 uppercase">
              Inspection · published source
            </span>
            {note && (
              <span className="font-mono text-[0.58rem] break-all text-muted-foreground">{note}</span>
            )}
          </div>
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
      <div className="flex items-start gap-3 sm:gap-5">
        <div className="flex flex-col items-center pt-1">
          <span className="font-mono text-[0.58rem] tracking-[0.2em] text-gold/80 sm:text-[0.6rem]">
            {index}
          </span>
          <span className="mt-2 size-2 rounded-full bg-primary photon-glow alive" />
          <span className="photon-track mt-2 w-px flex-1 opacity-50" />
        </div>
        <div className="experience-layer min-w-0 flex-1 rounded-r-lg py-1 pr-0 pb-8 pl-3 sm:pl-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="text-etched font-display text-base tracking-[0.14em] text-foreground uppercase sm:text-xl sm:tracking-[0.18em]">
              {name}
            </h2>
            {read && <div className="text-[0.82rem] text-muted-foreground sm:text-sm">{read}</div>}
          </div>
          {glyph}
          {children}
        </div>
      </div>
    </section>
  );
}
