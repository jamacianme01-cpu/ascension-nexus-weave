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
