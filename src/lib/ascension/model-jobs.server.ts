import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { supportsEnvisionObjective, type ObjectiveDelivery } from "./result-model";

/**
 * Queue real Hunyuan3D generation for every physical pathway that has a
 * design objective but does not yet have a generated GLB.
 * Reference images are generated on claim, independently of answer delivery.
 *
 * The queue is service-role only. The Windows model worker is the only writer
 * allowed to claim and complete these jobs through the secured model-queue route.
 */
export async function enqueueDeliveryModels(
  requestId: string,
  delivery: ObjectiveDelivery | null,
  objective: string,
): Promise<void> {
  if (!delivery || !supportsEnvisionObjective(objective)) return;

  const choices = delivery.blend ? [...delivery.pathways, delivery.blend] : delivery.pathways;
  const rows = choices
    .filter((pathway) => !pathway.model_url)
    .map((pathway) => ({
      request_id: requestId,
      pathway_id: pathway.id,
      label: pathway.label.slice(0, 200),
      summary: [
        delivery.objective_fit ? `Requested meaning: ${delivery.objective_fit.interpretation.slice(0, 1000)}` : "",
        pathway.summary,
        ...pathway.steps,
      ].filter(Boolean).join("\n").slice(0, 5000),
      visual_svg: pathway.visual_svg ?? "",
      // Image-to-3D: the real generated concept image is the Hunyuan3D source.
      source_image_url: pathway.generated_image_url,
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
    .select("pathway_id, model_url, source_image_url, status, error")
    .eq("request_id", requestId);
  if (error) throw new Error(error.message);

  const jobs = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    if (typeof row["pathway_id"] === "string") jobs.set(row["pathway_id"], row);
  }
  const withUrl = <T extends ObjectiveDelivery["pathways"][number]>(pathway: T): T => {
    const job = jobs.get(pathway.id);
    if (!job) return pathway;
    const url = job["model_url"];
    const source = job["source_image_url"];
    const sourceUrl = typeof source === "string" && /^https:\/\//i.test(source) ? source : null;
    return {
      ...pathway,
      // LEFT reference and RIGHT GLB now share the same recorded Hunyuan input.
      // This documents lineage; it does NOT prove exact geometric reconstruction.
      generated_image_url: sourceUrl ?? pathway.generated_image_url,
      model_url:
        job["status"] === "completed" && typeof url === "string" && /^https:\/\//i.test(url)
          ? url
          : null,
      model_status: job["status"] as T["model_status"],
      model_error: typeof job["error"] === "string" ? job["error"] : null,
    };
  };

  return {
    ...delivery,
    // The persisted draft may contain a historic reference failure. Current
    // job statuses replace it once every affected choice has a queued job.
    limitations: (delivery.blend ? [...delivery.pathways, delivery.blend] : delivery.pathways)
      .every((pathway) => jobs.has(pathway.id))
      ? delivery.limitations.filter((message) => !message.startsWith("3D generation could not start for "))
      : delivery.limitations,
    pathways: delivery.pathways.map(withUrl),
    blend: delivery.blend ? withUrl(delivery.blend) : null,
  };
}

