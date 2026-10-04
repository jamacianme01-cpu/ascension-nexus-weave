import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ObjectiveDelivery } from "./result-model";

/**
 * Queue real Hunyuan3D generation for every physical pathway that has a
 * reference visual but does not yet have a generated GLB.
 *
 * The queue is service-role only. The Windows model worker is the only writer
 * allowed to claim and complete these jobs through the secured model-queue route.
 */
export async function enqueueDeliveryModels(
  requestId: string,
  delivery: ObjectiveDelivery | null,
): Promise<void> {
  if (!delivery) return;

  const choices = delivery.blend ? [...delivery.pathways, delivery.blend] : delivery.pathways;
  const rows = choices
    .filter(
      (pathway) =>
        Boolean(pathway.model_spec) &&
        Boolean(pathway.visual_svg) &&
        !pathway.model_url,
    )
    .map((pathway) => ({
      request_id: requestId,
      pathway_id: pathway.id,
      label: pathway.label.slice(0, 200),
      summary: pathway.summary.slice(0, 5000),
      visual_svg: pathway.visual_svg!,
      status: "queued",
      updated_at: new Date().toISOString(),
    }));

  if (!rows.length) return;

  // The generated Database type does not know about this just-added table yet;
  // keep the escape hatch isolated to this server-only boundary.
  const table = supabaseAdmin.from("ascension_model_jobs" as never) as any;
  const { error } = await table.upsert(rows, {
    onConflict: "request_id,pathway_id",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(error.message);
}

/**
 * Merge completed local Hunyuan3D jobs back into the delivery projection.
 * The answer payload stays immutable in the draft stage; generated mesh URLs
 * are a later asynchronous projection from ascension_model_jobs.
 */
export async function attachCompletedModels(
  requestId: string,
  delivery: ObjectiveDelivery | null,
): Promise<ObjectiveDelivery | null> {
  if (!delivery) return null;

  const table = supabaseAdmin.from("ascension_model_jobs" as never) as any;
  const { data, error } = await table
    .select("pathway_id, model_url, status")
    .eq("request_id", requestId)
    .eq("status", "completed")
    .not("model_url", "is", null);
  if (error) throw new Error(error.message);

  const urls = new Map<string, string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = typeof row["pathway_id"] === "string" ? row["pathway_id"] : "";
    const url = typeof row["model_url"] === "string" ? row["model_url"] : "";
    if (id && /^https:\/\//i.test(url)) urls.set(id, url);
  }
  if (!urls.size) return delivery;

  const withUrl = <T extends ObjectiveDelivery["pathways"][number]>(pathway: T): T => {
    const url = urls.get(pathway.id);
    return url ? ({ ...pathway, model_url: url } as T) : pathway;
  };

  return {
    ...delivery,
    pathways: delivery.pathways.map(withUrl),
    blend: delivery.blend ? withUrl(delivery.blend) : null,
  };
}
