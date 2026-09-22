import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  getMyLibraryCard,
  saveMyLibraryCard,
  type PersonalLibraryCard,
} from "@/lib/ascension/library-card.functions";
import { Engage } from "./engage";

type Mode = "loading" | "choice" | "card" | "review" | "engage";

type Draft = {
  who: string;
  what: string;
  why: string;
  destiny: string;
  currentState: string;
  strengths: string;
  constraints: string;
  relationships: string;
};

const EMPTY: Draft = {
  who: "",
  what: "",
  why: "",
  destiny: "",
  currentState: "",
  strengths: "",
  constraints: "",
  relationships: "",
};

function fromCard(card: PersonalLibraryCard): Draft {
  return {
    who: card.who,
    what: card.what,
    why: card.why,
    destiny: card.destiny,
    currentState: card.currentState,
    strengths: card.strengths.join("\n"),
    constraints: card.constraints.join("\n"),
    relationships: card.relationships.join("\n"),
  };
}

function lines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

const QUESTIONS: Record<keyof Draft, string> = {
  who: "Who are you? Describe your identity, role, continuity, and perspective.",
  what: "What are you building, doing, becoming, or responsible for?",
  why: "Why does it matter? What gives this direction meaning?",
  destiny: "What long-range outcome are you moving toward?",
  currentState: "Where are you starting from right now?",
  strengths: "What strengths or capabilities do you already carry? Put one per line.",
  constraints: "What limits, requirements, or conditions must be preserved? Put one per line.",
  relationships: "Which people, systems, projects, places, or forces are directly connected to this path? Put one per line.",
};

const LABELS: Record<keyof Draft, string> = {
  who: "WHO",
  what: "WHAT",
  why: "WHY",
  destiny: "DESTINY",
  currentState: "CURRENT STATE",
  strengths: "STRENGTHS / CAPABILITIES",
  constraints: "CONSTRAINTS",
  relationships: "KEY RELATIONSHIPS",
};

const REQUIRED = new Set<keyof Draft>(["who", "what", "why", "destiny"]);

/**
 * Entry contract:
 * - General question: may proceed without a Library Card.
 * - Personalized ASCENSION use: Library Card is visible before the Book.
 */
export function LibraryCardGate() {
  const [mode, setMode] = useState<Mode>("loading");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const forceCard = new URL(window.location.href).searchParams.get("library") === "1";
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;

        if (!data.user) {
          setMode(forceCard ? "card" : "choice");
          return;
        }

        const result = await getMyLibraryCard();
        if (cancelled) return;
        if (result.card) {
          setDraft(fromCard(result.card));
          setMode(forceCard ? "card" : "review");
        } else {
          setMode("choice");
        }
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setMode("choice");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openCard = async () => {
    setError(null);
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      window.location.href = `/auth?next=${encodeURIComponent("/?library=1")}`;
      return;
    }
    setMode("card");
  };

  const saveCard = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveMyLibraryCard({
        data: {
          who: draft.who,
          what: draft.what,
          why: draft.why,
          destiny: draft.destiny,
          currentState: draft.currentState,
          strengths: lines(draft.strengths),
          constraints: lines(draft.constraints),
          relationships: lines(draft.relationships),
        },
      });
      setDraft(fromCard(result.card));
      window.history.replaceState(null, "", "/");
      setMode("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  if (mode === "loading") {
    return <p className="py-16 text-center text-sm text-muted-foreground">Opening ASCENSION…</p>;
  }

  if (mode === "engage") return <Engage />;

  if (mode === "choice") {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl border border-gold/25 bg-void/85 p-6 shadow-2xl sm:p-10">
        <p className="label-eyebrow text-gold">ENTRY</p>
        <h1 className="mt-3 font-display text-3xl tracking-[0.2em] text-foreground uppercase">
          Library Card
        </h1>
        <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground">
          Choose whether this is a general question or a personalized ASCENSION pathway. Personalized
          work establishes the Library Card before the Book opens.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("engage")}
            className="min-h-14 rounded-xl border border-primary/35 bg-primary/5 px-5 text-left text-primary"
          >
            <span className="block font-display tracking-wide">GENERAL QUESTION</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Go directly to the Book without establishing a personal Library Card.
            </span>
          </button>
          <button
            type="button"
            onClick={() => void openCard()}
            className="min-h-14 rounded-xl border border-gold/45 bg-gold/10 px-5 text-left text-gold"
          >
            <span className="block font-display tracking-wide">ESTABLISH LIBRARY CARD</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Answer the Library Card questions, review the card, then continue to the Book.
            </span>
          </button>
        </div>
        {error && <p className="mt-5 text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  if (mode === "review") {
    const rows: (keyof Draft)[] = [
      "who",
      "what",
      "why",
      "destiny",
      "currentState",
      "strengths",
      "constraints",
      "relationships",
    ];
    return (
      <section className="mx-auto max-w-4xl rounded-2xl border border-gold/35 bg-void/90 p-6 shadow-2xl sm:p-10">
        <p className="label-eyebrow text-gold">BEFORE THE BOOK</p>
        <h1 className="mt-3 font-display text-3xl tracking-[0.18em] text-foreground uppercase">
          Your Library Card
        </h1>
        <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
          This is the identity and current-state layer ASCENSION carries into personalized work.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {rows.map((key) => (
            <article key={key} className="rounded-xl border border-gold/20 bg-background/20 p-4">
              <p className="font-display text-xs tracking-[0.18em] text-gold">{LABELS[key]}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{QUESTIONS[key]}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {draft[key] || "Not established yet."}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMode("card")}
            className="min-h-12 rounded-full border border-border px-5 text-sm text-muted-foreground"
          >
            EDIT LIBRARY CARD
          </button>
          <button
            type="button"
            onClick={() => setMode("engage")}
            className="min-h-12 rounded-full border border-gold/50 bg-gold/10 px-6 text-sm tracking-widest text-gold"
          >
            CONTINUE TO BOOK
          </button>
        </div>
      </section>
    );
  }

  const field = (key: keyof Draft, rows = 3) => (
    <label className="block">
      <span className="font-display text-sm tracking-wide text-foreground">
        {LABELS[key]}{REQUIRED.has(key) ? " *" : ""}
      </span>
      <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
        {QUESTIONS[key]}
      </span>
      <textarea
        value={draft[key]}
        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
        rows={rows}
        aria-label={QUESTIONS[key]}
        className="mt-3 w-full resize-y rounded-xl border border-primary/20 bg-void/70 px-4 py-3 text-sm leading-relaxed outline-none focus:border-primary/60"
      />
    </label>
  );

  return (
    <section className="mx-auto max-w-4xl rounded-2xl border border-gold/30 bg-void/90 p-6 shadow-2xl sm:p-10">
      <p className="label-eyebrow text-gold">BEFORE THE BOOK</p>
      <h1 className="mt-3 font-display text-3xl tracking-[0.18em] text-foreground uppercase">
        Establish Your Library Card
      </h1>
      <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
        Answer the questions themselves. They remain visible while you write; they are not input placeholders.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {field("who", 4)}
        {field("what", 4)}
        {field("why", 4)}
        {field("destiny", 4)}
        {field("currentState", 4)}
        {field("strengths", 4)}
        {field("constraints", 4)}
        {field("relationships", 4)}
      </div>

      {error && <p className="mt-5 text-sm text-destructive">{error}</p>}

      <div className="mt-8 flex flex-wrap justify-between gap-3">
        <button
          type="button"
          onClick={() => setMode("choice")}
          className="min-h-12 rounded-full border border-border px-5 text-sm text-muted-foreground"
        >
          Back
        </button>
        <button
          type="button"
          disabled={saving || !draft.who.trim() || !draft.what.trim() || !draft.why.trim() || !draft.destiny.trim()}
          onClick={() => void saveCard()}
          className="min-h-12 rounded-full border border-gold/50 bg-gold/10 px-6 text-sm tracking-widest text-gold disabled:opacity-40"
        >
          {saving ? "ESTABLISHING…" : "ESTABLISH LIBRARY CARD"}
        </button>
      </div>
    </section>
  );
}
