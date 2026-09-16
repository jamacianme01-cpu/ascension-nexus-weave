import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { DemoModeBanner, SourceBadge } from "@/components/ascension/states";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Ascension" },
  { to: "/knowledgeverse", label: "Knowledgeverse" },
  { to: "/console", label: "Inspect" },
] as const;

/** Console surfaces live behind the optional Inspect area. */
const INSPECT_NAV = [
  { to: "/console", label: "Chamber" },
  { to: "/console/knowledgeverse", label: "Knowledgeverse" },
  { to: "/pathways", label: "Pathways" },
  { to: "/governance", label: "Governance" },
  { to: "/ledger", label: "Verified Δ" },
  { to: "/live", label: "Live" },
  { to: "/objectives", label: "Runs" },
] as const;

const INSPECT_PREFIXES = [
  "/console",
  "/pathways",
  "/governance",
  "/ledger",
  "/live",
  "/objectives",
];

/** Contract vocabulary glossary. This is deliberately separate from the user's Library Card. */
const GLOSSARY: { term: string; gloss: string; source: string }[] = [
  {
    term: "ID / SID",
    gloss: "ID preserves entity identity and continuity. SID is the current embodiment or signature through which the entity experiences.",
    source: "state/entities.json → entity_id, sid",
  },
  {
    term: "Meaning Element (ME)",
    gloss: "Smallest governed unit of meaning: ME:<scheme>:<lexeme>:<category>:<hash>.",
    source: "entities.json → me_ids, Knowledge Form ME blocks",
  },
  {
    term: "Destiny",
    gloss: "The declared objective a chamber cycle resolves against.",
    source: "chamber_state.json → destiny, entities.json → destinies",
  },
  {
    term: "Verified Δ",
    gloss: "Accepted Knowledge / Understanding / Wisdom delta after verification.",
    source: "ledger.jsonl → accepted_delta, entity_delta_total",
  },
  {
    term: "DTF branch",
    gloss: "A simulated pathway with actions, risks, evaluation and expectation.",
    source: "last_transition.branches[]",
  },
  {
    term: "Outcome Predictor",
    gloss: "Predicted outcome score for a branch, with maturity bonus.",
    source: "branch.evaluation.outcome_predictor",
  },
  {
    term: "Guardian",
    gloss: "Governance verdict gating a branch before execution.",
    source: "branch.evaluation.guardian",
  },
  {
    term: "Constraint governance",
    gloss: "Applicable, remembered-not-applicable and superseded constraints.",
    source: "constraints.json, transition.constraint_governance",
  },
  {
    term: "Evidence",
    gloss: "Independent observation of artifact bytes (sha256 + size).",
    source: "evidence.json, transition.observed_evidence",
  },
  {
    term: "Relationship / resonance",
    gloss: "Shared-ME link between destinies in the world model.",
    source: "world_model.json → relationships[]",
  },
  {
    term: "Emergence candidate",
    gloss: "Possible composition detected across resonant destinies.",
    source: "world_model.json → emergence_candidates[]",
  },
  {
    term: "Hash chain",
    gloss: "previous_hash of a record must equal record_hash of the prior record.",
    source: "ledger.jsonl",
  },
];

export function Shell({ children }: { children: ReactNode }) {
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const glossaryRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const inspecting = INSPECT_PREFIXES.some(
    (prefix) => location.pathname === prefix || location.pathname.startsWith(prefix + "/"),
  );

  useEffect(() => {
    if (!glossaryOpen) return;
    glossaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGlossaryOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [glossaryOpen]);

  return (
    <div className="void-field relative min-h-screen">
      <div className="starfield pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative z-10">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-void/80 backdrop-blur-xl">
          <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6 lg:flex lg:flex-nowrap">
            <Link to="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <span className="alive size-2.5 shrink-0 rounded-full bg-primary photon-glow" />
              <span className="font-display text-etched truncate text-sm tracking-[0.28em] text-foreground uppercase sm:text-base sm:tracking-[0.34em]">
                Ascension
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-2 lg:order-3">
              <SourceBadge />
              <a
                href="/?library=1"
                className="min-h-9 rounded-sm border border-gold/35 px-3 py-2 font-mono text-[0.62rem] tracking-[0.18em] text-gold uppercase transition-colors hover:border-gold/65 hover:bg-gold/10 sm:text-[0.68rem] sm:tracking-[0.2em]"
              >
                Library Card
              </a>
              <button
                type="button"
                onClick={() => setGlossaryOpen((v) => !v)}
                aria-expanded={glossaryOpen}
                aria-controls="ascension-glossary"
                className={cn(
                  "min-h-9 rounded-sm border px-3 py-1.5 font-mono text-[0.62rem] tracking-[0.18em] uppercase transition-all duration-200 sm:text-[0.68rem] sm:tracking-[0.2em]",
                  glossaryOpen
                    ? "border-primary/60 bg-primary/10 text-primary photon-glow"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
                )}
              >
                Glossary
              </button>
            </div>
            <nav
              aria-label="ASCENSION surfaces"
              className="col-span-2 -mx-1 flex snap-x items-center gap-1 overflow-x-auto px-1 pb-0.5 lg:order-2 lg:col-span-1 lg:flex-1 lg:flex-wrap lg:overflow-visible"
            >
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="shrink-0 snap-start rounded-sm border border-transparent px-2.5 py-1.5 font-mono text-[0.64rem] tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:border-primary/25 hover:bg-primary/5 hover:text-foreground sm:text-[0.68rem] sm:tracking-[0.2em]"
                  activeProps={{
                    className: "text-primary bg-primary/10 border-primary/40 photon-glow",
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="gold-rule h-px opacity-60" />
          <DemoModeBanner />
        </header>

        {inspecting && (
          <nav
            aria-label="Inspect surfaces"
            className="sticky top-[4.6rem] z-20 border-b border-border/40 bg-void/70 backdrop-blur-lg"
          >
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-2 sm:px-6">
              <span className="mr-2 font-mono text-[0.58rem] tracking-[0.24em] text-muted-foreground/70 uppercase">
                Inspect ·
              </span>
              {INSPECT_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/console" }}
                  className="shrink-0 rounded-sm border border-transparent px-2 py-1 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:border-primary/25 hover:text-foreground"
                  activeProps={{
                    className: "text-primary bg-primary/10 border-primary/40",
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        )}

        {glossaryOpen && (
          <aside
            id="ascension-glossary"
            aria-label="ASCENSION glossary"
            className="border-b border-border/60 bg-void/85 backdrop-blur-xl"
          >
            <div
              ref={glossaryRef}
              tabIndex={-1}
              className="mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="label-eyebrow">Glossary</p>
                  <h2 className="text-etched mt-1 font-display text-base text-gold uppercase sm:text-lg">
                    Vocabulary of the governed contracts
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setGlossaryOpen(false)}
                  className="min-h-9 rounded-sm border border-border px-3 py-1.5 font-mono text-[0.62rem] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:border-gold/50 hover:text-gold"
                >
                  Close · esc
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {GLOSSARY.map((entry) => (
                  <div key={entry.term} className="glass-inset rounded-md px-3 py-3">
                    <p className="font-display text-sm tracking-wide text-primary">{entry.term}</p>
                    <p className="mt-1 text-[0.82rem] leading-relaxed text-muted-foreground">
                      {entry.gloss}
                    </p>
                    <p className="mt-2 font-mono text-[0.65rem] break-words text-gold/70">
                      {entry.source}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">{children}</main>

        <footer className="border-t border-border/60 px-4 py-6 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[0.65rem] tracking-[0.24em] text-muted-foreground uppercase">
              Published state · governed objective intake · verification remains core-authoritative
            </p>
            <p className="font-display text-[0.7rem] tracking-[0.3em] text-gold/80 uppercase">
              Everything is connected · Evolution is key
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
