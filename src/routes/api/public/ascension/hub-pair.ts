import { createFileRoute } from "@tanstack/react-router";
import { randomBytes, createHash } from "node:crypto";

function respond(value:unknown,status=200):Response {
  return new Response(JSON.stringify(value),{status,headers:{
    "content-type":"application/json","cache-control":"no-store"
  }});
}

/** Owner-authenticated pairing. Never give an unauthenticated visitor hub access. */
export const Route = createFileRoute("/api/public/ascension/hub-pair")({
  server: {handlers: {POST: async ({request}) => {
    const configuredOwnerId = process.env["ASCENSION_HUB_OWNER_USER_ID"]?.trim();
    const auth = /^Bearer\s+([^\s]+)$/.exec(request.headers.get("authorization")??"");
    if (!auth) return respond({error:"authentication_required"},401);
    const {supabaseAdmin} = await import("@/integrations/supabase/client.server");
    const {data,error:authError} = await supabaseAdmin.auth.getUser(auth[1]);
    if (authError || !data.user) return respond({error:"authentication_required"},401);
    let authorized = configuredOwnerId === data.user.id;
    if (!authorized) {
      // Operator-approved owner allowlist; service role only, no public RLS.
      const ownerDb = supabaseAdmin as unknown as {
        from(name:string): {select(cols:string): {
          eq(column:string,value:string): {
            maybeSingle():Promise<{data:{user_id:string}|null;error:unknown}>
          }
        }}
      };
      const {data: allowed,error:ownerError} = await ownerDb.from("ascension_hub_owners")
        .select("user_id").eq("user_id",data.user.id).maybeSingle();
      if (ownerError) return respond({error:"owner_authorization_unavailable"},503);
      authorized = Boolean(allowed);
    }
    if (!authorized) return respond({error:"owner_not_authorized"},403);

    const key=randomBytes(48).toString("hex");
    const hash=createHash("sha256").update(key).digest("hex");
    const db=supabaseAdmin as unknown as {
      from(name:string): {
        upsert(row:Record<string,string|null>,options:{onConflict:string}):
          Promise<{error:unknown}>
      }
    };
    const {error} = await db.from("ascension_hub_connections").upsert({
      id:"primary",owner_user_id:data.user.id,key_hash:hash,
      created_at:new Date().toISOString(),revoked_at:null
    },{onConflict:"id"});
    if (error) return respond({error:"hub_pairing_unavailable"},503);
    // No raw secret stored server-side. Reissuing revokes the previous key.
    return respond({key,note:"Pair the old computer once. Do not share the key."});
  }}},
});
