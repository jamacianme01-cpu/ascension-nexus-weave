import { createServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ObjectiveRun } from "./objectives.functions";

type RpcResult<T> = { data: T | null; error: { message: string } | null };

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const call = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult<T>>;
  const { data, error } = await call(name, args);
  if (error) throw new Error(error.message);
  return data;
}

function validateRequest(input: { requestId: string; guestToken: string; retry?: boolean }) {
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId)) throw new Error("A valid request id is required.");
  if (!/^[a-f0-9-]{36}$/i.test(input.guestToken)) throw new Error("A valid guest token is required.");
  return {
    requestId: input.requestId,
    guestToken: input.guestToken,
    retry: input.retry === true,
  };
}

export interface GuestSubmission {
  request: ObjectiveRun;
  guestToken: string;
}

interface GuestBundle {
  run: ObjectiveRun;
  delivery_stage: {
    created_at: string;
    status: string;
    response_payload: Json | null;
    error: string | null;
    engine_model: string | null;
    engine_label: string;
  } | null;
  artifact_stage: {
    response_payload: Json | null;
    status: string;
  } | null;
}

export interface GuestDeliveryState {
  created_at: string;
  status: string;
  response_payload: Json | null;
  error: string | null;
  engine_model: string | null;
  engine_label: string;
}

export const submitGuestObjective = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      objective: string;
      evidence?: string[];
      constraints?: string[];
      parentRequestId?: string;
      parentGuestToken?: string;
      followUp?: "continue" | "refine";
    }) => {
      const objective = input.objective?.trim();
      if (!objective) throw new Error("An objective statement is required.");
      const clean = (list: string[] | undefined, max: number) => {
        const items = (list ?? [])
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 32);
        return items.length ? items.map((item) => item.slice(0, max)) : null;
      };
      return {
        objective: objective.slice(0, 4000),
        evidence: clean(input.evidence, 2000),
        constraints: clean(input.constraints, 500),
        parentRequestId: input.parentRequestId ?? null,
        parentGuestToken: input.parentGuestToken ?? null,
        followUp: input.followUp ?? null,
      };
    },
  )
  .handler(async ({ data }) => {
    const payload = await rpc<{
      request: ObjectiveRun;
      guest_token: string;
    }>("ascension_guest_submit", {
      p_objective: data.objective,
      p_evidence: data.evidence,
      p_constraints: data.constraints,
      p_parent_request_id: data.parentRequestId,
      p_parent_guest_token: data.parentGuestToken,
      p_follow_up: data.followUp,
    });

    if (!payload?.request || !payload.guest_token)
      throw new Error("ASCENSION could not accept this objective.");

    return {
      request: payload.request,
      guestToken: payload.guest_token,
    } satisfies GuestSubmission;
  });

export const getGuestObjectiveStatus = createServerFn({ method: "GET" })
  .inputValidator(validateRequest)
  .handler(async ({ data }) => {
    const row = await rpc<ObjectiveRun>("ascension_guest_status", {
      p_request_id: data.requestId,
      p_guest_token: data.guestToken,
    });
    return { request: row ?? null };
  });

async function projectGuestDelivery(
  requestId: string,
  guestToken: string,
): Promise<GuestDeliveryState | null> {
  const bundle = await rpc<GuestBundle>("ascension_guest_bundle", {
    p_request_id: requestId,
    p_guest_token: guestToken,
  });
  if (!bundle?.run) return null;

  const stored = bundle.delivery_stage;
  if (
    stored?.status === "completed" &&
    stored.engine_label === "GOVERNED_RUNTIME_RESULT_V2" &&
    stored.response_payload
  ) {
    return stored;
  }

  if (bundle.run.result === null) {
    return {
      created_at: stored?.created_at ?? bundle.run.created_at,
      status: "running",
      response_payload: null,
      error: null,
      engine_model: "governed-runtime",
      engine_label: "GUEST_RUNTIME_RESULT_V2",
    };
  }

  const { projectRuntimeDelivery } = await import("./engine/delivery.server");
  const delivery = projectRuntimeDelivery(
    { objective: bundle.run.objective, result: bundle.run.result },
    bundle.artifact_stage?.status === "completed"
      ? bundle.artifact_stage.response_payload
      : null,
  );

  return {
    created_at: stored?.created_at ?? bundle.run.completed_at ?? bundle.run.updated_at,
    status: delivery ? "completed" : "running",
    response_payload: delivery as unknown as Json,
    error: null,
    engine_model: "governed-runtime",
    engine_label: "GUEST_RUNTIME_RESULT_V2",
  };
}

export const getGuestObjectiveDelivery = createServerFn({ method: "GET" })
  .inputValidator(validateRequest)
  .handler(async ({ data }) => projectGuestDelivery(data.requestId, data.guestToken));

export const prepareGuestObjectiveDelivery = createServerFn({ method: "POST" })
  .inputValidator(validateRequest)
  .handler(async ({ data }) => projectGuestDelivery(data.requestId, data.guestToken));
