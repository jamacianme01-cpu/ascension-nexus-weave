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
    return row as unknown as DeliveryState | null;
  });

/** External answer/draft only. Never changes a governed request or awards Δ. */
export const prepareObjectiveDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    // Resolve ownership with the caller's RLS session before using the admin client.
    const { data: run, error } = await context.supabase
      .from("ascension_execution_requests")
      .select("id, objective, evidence, constraints, result, engine, submitted_by")
      .eq("id", data.requestId)
      .eq("submitted_by", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("This objective is unavailable to your account.");
    if (run.engine !== "governed_runtime")
      throw new Error("This run uses a different result workflow.");
    const { prepareDelivery } = await import("./engine/delivery.server");
    return prepareDelivery(run, data.retry);
  });
