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
}

function validate(input: { requestId: string; retry?: boolean }) {
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId)) throw new Error("A valid request id is required.");
  return { requestId: input.requestId, retry: input.retry === true };
}

/**
 * Result-first read.
 *
 * A user-facing answer is external output and does not wait for the governed
 * runtime to finish. If no delivery exists yet, the first authenticated read
 * starts one for the caller's own objective. The governed runtime continues
 * independently and remains the only authority for Verified / Persisted state.
 */
export const getObjectiveDelivery = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ascension_run_stages")
      .select("status, response_payload, error, engine_model, engine_label, created_at")
      .eq("request_id", data.requestId)
      .eq("ordinal", DELIVERY_ORDINAL)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (row) return row as unknown as DeliveryState;

    const { data: run, error: runError } = await context.supabase
      .from("ascension_execution_requests")
      .select("id, objective, evidence, constraints, result, submitted_by")
      .eq("id", data.requestId)
      .eq("submitted_by", context.userId)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (!run) return null;

    const { prepareDelivery } = await import("./engine/delivery.server");
    return (await prepareDelivery(run, false)) as unknown as DeliveryState | null;
  });

/** External answer/draft. Governance continues independently. */
export const prepareObjectiveDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("ascension_execution_requests")
      .select("id, objective, evidence, constraints, result, engine, status, submitted_by")
      .eq("id", data.requestId)
      .eq("submitted_by", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("This objective is unavailable to your account.");
    const { prepareDelivery } = await import("./engine/delivery.server");
    return prepareDelivery(run, data.retry);
  });
