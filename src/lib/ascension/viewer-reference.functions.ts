import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Bind an existing, owner-requested dissected image to its exact pathway's
 * Hunyuan job. The queue may only accept it while still queued. This preserves
 * the on-screen reference as the actual input to image-to-3D generation.
 *
 * Source lineage does NOT establish geometric or manufacturing fidelity.
 */
export const bindViewerReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string; pathwayId: string; imageUrl: string }) => {
    if (!/^[a-f0-9-]{36}$/i.test(input?.requestId ?? "")) throw new Error("Invalid objective ID");
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(input?.pathwayId ?? "")) throw new Error("Invalid pathway ID");
    if (typeof input?.imageUrl !== "string" || input.imageUrl.length > 4000)
      throw new Error("Invalid source image");
    return input;
  })
  .handler(async ({data, context}) => {
    // NEVER bind a public image to another owner's objective.
    const { data: owner, error: ownerError } = await context.supabase
      .from("ascension_execution_requests")
      .select("id")
      .eq("id", data.requestId)
      .eq("submitted_by", context.userId)
      .maybeSingle();
    if (ownerError) throw new Error(ownerError.message);
    if (!owner) throw new Error("The selected objective is not owned by this session");

    const {supabaseAdmin} = await import("@/integrations/supabase/client.server");
    const match = data.imageUrl.match(/\/storage\/v1\/object\/public\/ascension-models\/(dissected\/[a-f0-9]{64}\.png)$/);
    if (!match) throw new Error("Only an ASCENSION-generated dissected image can be linked");
    const objectPath = match[1]!;
    const publicUrl = supabaseAdmin.storage.from("ascension-models").getPublicUrl(objectPath).data.publicUrl;
    if (publicUrl !== data.imageUrl) throw new Error("The reference does not belong to ASCENSION storage");
    const name = objectPath.split("/").at(-1)!;
    const found = await supabaseAdmin.storage.from("ascension-models").list("dissected", {search: name,limit:10});
    if (found.error) throw new Error(found.error.message);
    if (!(found.data ?? []).some(item => item.name === name))
      throw new Error("The reference image has not been saved");

    const table = supabaseAdmin.from("ascension_model_jobs" as never) as any;
    const {data: job, error: jobError} = await table
      .select("id,status,source_image_url")
      .eq("request_id",data.requestId)
      .eq("pathway_id",data.pathwayId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    if (!job) throw new Error("The selected pathway has no model job");
    if (job.source_image_url === publicUrl) return {linked:true,status:job.status as string};
    // Once claimed/running/completed, the worker owns this input. Never swap
    // its source out from under an active generation.
    if (job.status !== "queued" || job.source_image_url)
      return {linked:false,status:job.status as string,reason:"The model job has already selected its reference"};

    const {data: updated,error} = await table.update({
      source_image_url:publicUrl,updated_at:new Date().toISOString()
    }).eq("id",job.id).eq("status","queued").is("source_image_url",null).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return {linked:Boolean(updated),status:"queued",reason:updated?undefined:"The worker claimed this job before the reference could be linked"};
  });
