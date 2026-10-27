import { createHash, timingSafeEqual } from "node:crypto";

/** Authenticate a separately paired ASCENSION hub device, never a legacy publish token. */
export async function authorizeAscensionHub(request: Request): Promise<Response | null> {
  // The existing core QueueClient sends its key in the legacy-named header. The
  // NEW 48-byte paired credential is accepted there for wire compatibility.
  const raw = request.headers.get("x-ascension-hub-key") ??
              request.headers.get("x-ascension-publish-token");
  if (!raw || !/^[a-f0-9]{96}$/i.test(raw)) return denied("hub_not_paired", 401);
  const providedHash = createHash("sha256").update(raw.toLowerCase()).digest();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The new migration is not yet reflected in Lovable's generated DB types.
  const db = supabaseAdmin as unknown as {
    from(name: string): {
      select(cols: string): {eq(k:string,v:string): {
        is(k:string,v:null): {maybeSingle(): Promise<{
          data: {key_hash:string}|null; error: unknown
        }>}
      }}
    }
  };
  const {data,error} = await db.from("ascension_hub_connections")
    .select("key_hash").eq("id","primary").is("revoked_at",null).maybeSingle();
  if (error) return denied("hub_auth_unavailable", 503);
  if (typeof data?.key_hash === "string" && /^[a-f0-9]{64}$/.test(data.key_hash)) {
    if (timingSafeEqual(providedHash, Buffer.from(data.key_hash, "hex"))) return null;
  }
  return denied("unauthorized",401);
}
function denied(error:string,status:number): Response {
  return new Response(JSON.stringify({error}),{status,headers:{
    "content-type":"application/json","cache-control":"no-store"
  }});
}
