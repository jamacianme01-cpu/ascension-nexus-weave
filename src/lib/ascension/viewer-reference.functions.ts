import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ReferenceInput = { requestId:string; pathwayId:string; imageUrl:string };
function validate(input: ReferenceInput): ReferenceInput {
  if (!/^[a-f0-9-]{36}$/i.test(input?.requestId ?? "")) throw new Error("Invalid objective ID");
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(input?.pathwayId ?? "")) throw new Error("Invalid pathway ID");
  if (typeof input?.imageUrl !== "string" || input.imageUrl.length > 4000)
    throw new Error("Invalid source image");
  return input;
}

/** Uses an existing generated, saved image as the exact queued model input.
 * Source provenance alone is NOT geometric verification of the resulting GLB.
 * Owner or guest authorization is required before invoking this function.
 */
async function recordReference(data: ReferenceInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const match = data.imageUrl.match(/\/storage\/v1\/object\/public\/ascension-models\/(assembled\/[a-f0-9]{64}\.png)$/);
  if (!match) throw new Error("Only an ASCENSION-generated assembled image can be linked");
  const objectPath = match[1]!;
  const publicUrl = supabaseAdmin.storage.from("ascension-models").getPublicUrl(objectPath).data.publicUrl;
  if (publicUrl !== data.imageUrl) throw new Error("Image URL is not from ASCENSION storage");
  const name = objectPath.split("/").at(-1)!;
  const found = await supabaseAdmin.storage.from("ascension-models").list("assembled", {search:name,limit:10});
  if (found.error) throw new Error(found.error.message);
  if (!(found.data ?? []).some(item => item.name === name))
    throw new Error("Reference image was not saved");

  const table = supabaseAdmin.from("ascension_model_jobs" as never) as any;
  const { data: job, error: jobError } = await table
    .select("id,status,source_image_url")
    .eq("request_id",data.requestId)
    .eq("pathway_id",data.pathwayId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) throw new Error("The selected pathway has no model job");
  if (job.source_image_url === publicUrl) return {linked:true,status:job.status as string};
  if (job.status !== "queued" || job.source_image_url)
    return {linked:false,status:job.status as string,reason:"The model job has already selected its reference"};
  // Claim and user binding race safely: neither can overwrite the other's source.
  const {data: updated,error} = await table.update({
    source_image_url:publicUrl,updated_at:new Date().toISOString()
  }).eq("id",job.id).eq("status","queued").is("source_image_url",null)
    .select("id").maybeSingle();
  if (error) throw new Error(error.message);
  return {linked:Boolean(updated),status:"queued",reason:updated?undefined:"The worker claimed this job first"};
}

export const bindViewerReference = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({data,context}) => {
    const {data:owner,error} = await context.supabase
      .from("ascension_execution_requests").select("id")
      .eq("id",data.requestId).eq("submitted_by",context.userId).maybeSingle();
    if(error)throw new Error(error.message);
    if(!owner)throw new Error("The objective is not owned by this session");
    return recordReference(data);
  });

/** Guest sessions authenticate with the existing one-time objective guest token,
 * never with an unauthenticated request or just the public image URL.
 */
export const bindGuestViewerReference = createServerFn({method:"POST"})
  .inputValidator((input:ReferenceInput & {guestToken:string})=>{
    const data=validate(input);
    if(!/^[a-f0-9-]{36}$/i.test(input?.guestToken ?? ""))
      throw new Error("Invalid guest token");
    return {...data,guestToken:input.guestToken};
  })
  .handler(async ({data})=>{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {data:bundle,error}=await supabaseAdmin.rpc("ascension_guest_bundle",{
      p_request_id:data.requestId,p_guest_token:data.guestToken
    });
    if(error)throw new Error(error.message);
    const run=bundle && typeof bundle==="object" && !Array.isArray(bundle)
      ? (bundle as Record<string,unknown>)["run"]:null;
    if(!run || typeof run!=="object" || Array.isArray(run) ||
       (run as Record<string,unknown>)["id"]!==data.requestId)
      throw new Error("The objective is not available to this guest session");
    return recordReference(data);
  });
