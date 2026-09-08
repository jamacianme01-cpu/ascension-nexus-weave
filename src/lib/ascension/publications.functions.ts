import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

/**
 * Authenticated reads of the mirrored LIVE_GOVERNED publication.
 *
 * Observation only. Publications are written exclusively by the secured push
 * endpoint (/api/public/ascension/publish) using the service role; no
 * authenticated user path can insert, update or delete a publication row.
 * Absent fields stay absent — nothing here fills, defaults or infers a value.
 */

export interface GovernedSurface {
  surface: string;
  revision: number;
  source_classification: string;
  snapshot_hash: string | null;
  content_hash: string | null;
  payload: Json;
  published_at: string | null;
  received_at: string;
}

export const getGovernedPublication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ascension_publications")
      .select(
        "surface, revision, source_classification, snapshot_hash, content_hash, payload, published_at, received_at",
      )
      .order("revision", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as GovernedSurface[];
    // Highest revision wins per surface; earlier revisions stay in the store.
    const latestBySurface = new Map<string, GovernedSurface>();
    for (const row of rows) {
      if (!latestBySurface.has(row.surface)) latestBySurface.set(row.surface, row);
    }
    const surfaces = [...latestBySurface.values()].sort((a, b) =>
      a.surface.localeCompare(b.surface),
    );
    const revision = surfaces.length
      ? Math.max(...surfaces.map((surface) => surface.revision))
      : null;

    return { revision, surfaces, total_records: rows.length };
  });

export const listMyObservations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ascension_user_observations")
      .select("id, surface, entity_id, revision, label, note, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const saveObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      label: string;
      note?: string;
      surface?: string;
      entityId?: string;
      revision?: number;
    }) => {
      const label = input.label?.trim();
      if (!label) throw new Error("An observation needs a label.");
      return {
        label: label.slice(0, 200),
        note: input.note?.trim().slice(0, 4000) ?? null,
        surface: input.surface?.trim() || null,
        entityId: input.entityId?.trim() || null,
        revision: typeof input.revision === "number" ? input.revision : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ascension_user_observations").insert({
      user_id: context.userId,
      label: data.label,
      note: data.note,
      surface: data.surface,
      entity_id: data.entityId,
      revision: data.revision,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Missing observation id.");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ascension_user_observations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
