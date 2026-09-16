import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LIBRARY_CARD_LABEL = "ASCENSION_LIBRARY_CARD_V1";
const LIBRARY_CARD_SURFACE = "library_card_profile";

export interface PersonalLibraryCard {
  who: string;
  what: string;
  why: string;
  destiny: string;
  currentState: string;
  strengths: string[];
  constraints: string[];
  relationships: string[];
  createdAt: string;
  updatedAt: string;
}

function cleanText(value: string | undefined, max: number) {
  return (value ?? "").trim().slice(0, max);
}

function cleanList(value: string[] | undefined, max: number) {
  return (value ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 32)
    .map((item) => item.slice(0, max));
}

function parseCard(note: string | null): PersonalLibraryCard | null {
  if (!note) return null;
  try {
    const value = JSON.parse(note) as Partial<PersonalLibraryCard>;
    if (!value || typeof value !== "object") return null;
    if (!value.who || !value.what || !value.why || !value.destiny) return null;
    return {
      who: String(value.who),
      what: String(value.what),
      why: String(value.why),
      destiny: String(value.destiny),
      currentState: String(value.currentState ?? ""),
      strengths: Array.isArray(value.strengths) ? value.strengths.map(String) : [],
      constraints: Array.isArray(value.constraints) ? value.constraints.map(String) : [],
      relationships: Array.isArray(value.relationships) ? value.relationships.map(String) : [],
      createdAt: String(value.createdAt ?? ""),
      updatedAt: String(value.updatedAt ?? ""),
    };
  } catch {
    return null;
  }
}

export const getMyLibraryCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ascension_user_observations")
      .select("note, created_at, updated_at")
      .eq("user_id", context.userId)
      .eq("surface", LIBRARY_CARD_SURFACE)
      .eq("label", LIBRARY_CARD_LABEL)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { card: parseCard(data?.note ?? null) };
  });

export const saveMyLibraryCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      who: string;
      what: string;
      why: string;
      destiny: string;
      currentState?: string;
      strengths?: string[];
      constraints?: string[];
      relationships?: string[];
    }) => {
      const who = cleanText(input.who, 800);
      const what = cleanText(input.what, 1200);
      const why = cleanText(input.why, 1200);
      const destiny = cleanText(input.destiny, 1200);
      if (!who || !what || !why || !destiny)
        throw new Error("WHO, WHAT, WHY, and Destiny are required to establish the Library Card.");
      return {
        who,
        what,
        why,
        destiny,
        currentState: cleanText(input.currentState, 1600),
        strengths: cleanList(input.strengths, 500),
        constraints: cleanList(input.constraints, 500),
        relationships: cleanList(input.relationships, 500),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: readError } = await context.supabase
      .from("ascension_user_observations")
      .select("id, note, created_at")
      .eq("user_id", context.userId)
      .eq("surface", LIBRARY_CARD_SURFACE)
      .eq("label", LIBRARY_CARD_LABEL)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const previous = parseCard(existing?.note ?? null);
    const now = new Date().toISOString();
    const card: PersonalLibraryCard = {
      ...data,
      createdAt: previous?.createdAt || existing?.created_at || now,
      updatedAt: now,
    };
    const note = JSON.stringify(card);

    if (existing) {
      const { error } = await context.supabase
        .from("ascension_user_observations")
        .update({ note, updated_at: now })
        .eq("id", existing.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("ascension_user_observations").insert({
        user_id: context.userId,
        label: LIBRARY_CARD_LABEL,
        surface: LIBRARY_CARD_SURFACE,
        note,
      });
      if (error) throw new Error(error.message);
    }

    return { card };
  });
