import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  getMyLibraryCard,
  saveMyLibraryCard,
  type PersonalLibraryCard,
} from "@/lib/ascension/library-card.functions";
import { Engage } from "./engage";

type Mode = "loading" | "choice" | "card" | "engage";

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

/**
 * Entry contract:
 * - General question: may proceed without a Library Card.
 * - Personalized ASCENSION use: Library Card is established before the Book.
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
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!data.user) {
        setMode(forceCard ? "card" : "choice");
        return;
      }

      try {
        const result = await getMyLibraryCard();
        if (cancelled) return;
        if (result.card) {
          setDraft(fromCard(result.card));
          setMode(forceCard ? "card" : "engage");
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
      setMode("engage");
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
          Personalized ASCENSION begins from your Library Card. It establishes the starting identity,
          Destiny, current state, strengths, constraints, and relationships that the Knowledgeverse
          can build from.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("engage")}
            className="min-h-14 rounded-xl border border-primary/35 bg-primary/5 px-5 text-left text-primary"
          >
            <span className="block font-display tracking-wide">GENERAL QUESTION</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Basic pathway access without a personal Library Card.
            </span>
          </button>
          <button
            type="button"
            onClick={() => void openCard()}
            className="min-h-14 rounded-xl border border-gold/45 bg-gold/10 px-5 text-left text-gold"
          >
            <span className="block font-display tracking-wide">ESTABLISH LIBRARY CARD</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Required before personalized pathways, Destiny, execution, or capability extension.
            </span>
          </button>
        </div>
        {error && <p className="mt-5 text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  const field = (
    key: keyof Draft,
    label: string,
    placeholder: string,
    rows = 3,
    required = false,
  ) => (
    <label className="block">
      <span className="font-display text-sm tracking-wide text-foreground">
        {label}{required ? " *" : ""}
      </span>
      <textarea
        value={draft[key]}
        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
        rows={rows}
        placeholder={placeholder}
        className="mt-2 w-full resize-y rounded-xl border border-primary/20 bg-void/70 px-4 py-3 text-sm leading-relaxed outline-none focus:border-primary/60"
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
        This is the starting source of truth for your personalized ASCENSION experience. Verified
        experience can evolve it later; the Book does not collect it.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {field("who", "WHO", "Who are you? Identity, role, continuity, perspective.", 4, true)}
        {field("what", "WHAT", "What are you building, doing, becoming, or responsible for?", 4, true)}
        {field("why", "WHY", "Why does it matter? What gives the direction meaning?", 4, true)}
        {field("destiny", "DESTINY", "What long-range outcome are you moving toward?", 4, true)}
        {field("currentState", "CURRENT STATE", "Where are you starting from right now?", 4)}
        {field("strengths", "STRENGTHS / CAPABILITIES", "One per line", 4)}
        {field("constraints", "CONSTRAINTS", "One per line", 4)}
        {field("relationships", "KEY RELATIONSHIPS", "One per line", 4)}
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
