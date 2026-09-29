import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ObjectiveDelivery } from "./result-model";

export const DELIVERY_ORDINAL = 100;
export interface DeliveryState {
  created_at: string;
  status: string;
  response_payload: ObjectiveDelivery | null;
  error: string | null;
  engine_model: string | null;
  engine_label: string;
  note?: string | null;
  source?: "governed" | "external_draft" | null;
}

function validate(input: { requestId: string; retry?: boolean }) {
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId)) throw new Error("A valid request id is required.");
  return { requestId: input.requestId, retry: input.retry === true };
}

async function resolveForOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  requestId: string,
  retry: boolean,
): Promise<DeliveryState | null> {
  const { data: run, error } = await supabase
    .from("ascension_execution_requests")
    .select("id, objective, evidence, constraints, status, result, completed_at, updated_at, created_at")
    .eq("id", requestId)
    .eq("submitted_by", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) return null;
  const { data: stages, error: stageError } = await supabase
    .from("ascension_run_stages")
    .select("ordinal, status, response_payload, error, engine_model, created_at, request_payload")
    .eq("request_id", requestId)
    .in("ordinal", [101, 102]);
  if (stageError) throw new Error(stageError.message);
  const byOrdinal = (n: number) =>
    (stages as { ordinal: number }[] | null)?.find((s) => s.ordinal === n) ?? null;
  const engine = await import("./engine/delivery.server");
  return engine.resolveDelivery({
    run,
    artifactStage: byOrdinal(101) as { status: string; response_payload: unknown } | null,
    draft: engine.draftFromStage(byOrdinal(102)),
    store: await engine.adminDraftStore(requestId),
    retry,
  });
}

/** Read what the answer panel should show for this run (never terminal mid-run). */
export const getObjectiveDelivery = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) =>
    resolveForOwner(context.supabase, context.userId, data.requestId, false),
  );

/** Same as above, but a retry re-runs a failed external draft. */
export const prepareObjectiveDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const state = await resolveForOwner(context.supabase, context.userId, data.requestId, data.retry);
    if (!state) throw new Error("This objective is unavailable to your account.");
    return state;
  });
