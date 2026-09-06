import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Chamber" },
  { to: "/knowledgeverse", label: "Knowledgeverse" },
  { to: "/pathways", label: "Pathways" },
  { to: "/governance", label: "Governance" },
  { to: "/ledger", label: "Verified Δ" },
] as const;

/**
 * Library Card entries describe the vocabulary of the source contracts.
 * They are interface glossary copy only — no state values are derived here.
 */
const GLOSSARY: { term: string; gloss: string; source: string }[] = [
  {
    term: "ID / SID",
    gloss: "Entity identity and its state identity at a given cycle.",
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
  const [cardOpen, setCardOpen] = useState(false);

  return (
    <div className="void-field relative min-h-screen">
      <div className="starfield pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative z-10">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-void/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
            <Link to="/" className="group flex items-center gap-3">
              <span className="alive size-2.5 rounded-full bg-primary photon-glow" />
              <span className="font-display text-etched text-base tracking-[0.34em] text-foreground uppercase">
                Ascension
              </span>
            </Link>
            <nav className="flex flex-1 flex-wrap items-center gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="rounded-sm px-2.5 py-1.5 font-mono text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:text-foreground"
                  activeProps={{ className: "text-primary bg-primary/10 border border-primary/30" }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <button
              type="button"
              onClick={() => setCardOpen((v) => !v)}
              aria-expanded={cardOpen}
              className={cn(
                "rounded-sm border px-3 py-1.5 font-mono text-[0.68rem] tracking-[0.2em] uppercase transition-colors",
                cardOpen
                  ? "border-gold/60 bg-gold/15 text-gold gold-glow"
                  : "border-border text-muted-foreground hover:text-gold",
              )}
            >
              Library Card
            </button>
          </div>
          <div className="gold-rule h-px opacity-60" />
        </header>

        {cardOpen && (
          <aside className="border-b border-border/60 bg-void/80 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
              <p className="label-eyebrow">Library Card · Glossary</p>
              <h2 className="text-etched mt-1 font-display text-lg text-gold uppercase">
                Vocabulary of the governed contracts
              </h2>
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
              Observation only · read-only projection of published state
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
