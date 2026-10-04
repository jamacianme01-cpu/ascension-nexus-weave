import { createServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ObjectiveRun } from "./objectives.functions";
import type { ObjectiveDelivery } from "./result-model";

type RpcResult<T> = { data: T | null; error: { message: string } | null };

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  // Keep rpc bound to the Supabase client. Detaching supabase.rpc loses its
  // internal client context and causes "Cannot read properties of undefined
  // (reading 'rest')" at runtime.
  const { data, error } = (await supabase.rpc(
    name as never,
    args as never,
  )) as unknown as RpcResult<T>;
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
  draft_stage?: unknown;
}

export interface GuestDeliveryState {
  created_at: string;
  status: string;
  response_payload: ObjectiveDelivery | null;
  error: string | null;
  engine_model: string | null;
  engine_label: string;
  note?: string | null;
  source?: "governed" | "external_draft" | null;
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
  retry: boolean,
): Promise<GuestDeliveryState | null> {
  const bundle = await rpc<GuestBundle>("ascension_guest_bundle", {
    p_request_id: requestId,
    p_guest_token: guestToken,
  });
  if (!bundle?.run) return null;

  const engine = await import("./engine/delivery.server");
  const draftRpc = (action: string, sourceKey: string, extra: Record<string, unknown> = {}) =>
    rpc<boolean>("ascension_guest_draft", {
      p_request_id: requestId,
      p_guest_token: guestToken,
      p_action: action,
      p_source_key: sourceKey,
      p_expected_created_at: null,
      p_payload: null,
      p_error: null,
      ...extra,
    });
  const state = await engine.resolveDelivery({
    run: bundle.run,
    artifactStage: bundle.artifact_stage,
    draft: engine.draftFromStage(bundle.draft_stage),
    retry,
    store: {
      claim: async (key, expected) =>
        (await draftRpc("claim", key, { p_expected_created_at: expected })) === true,
      complete: async (key, payload) => {
        await draftRpc("complete", key, { p_payload: payload });
      },
      fail: async (key, message) => {
        await draftRpc("fail", key, { p_error: message });
      },
    },
  });
  if (state.status === "completed" && state.response_payload) {
    const modelJobs = await import("./model-jobs.server");
    try {
      const hydrated = await modelJobs.attachCompletedModels(requestId, state.response_payload);
      await modelJobs.enqueueDeliveryModels(requestId, hydrated);
      return { ...state, response_payload: hydrated } as unknown as GuestDeliveryState;
    } catch {
      // Model generation is asynchronous and must not break guest answer delivery.
    }
  }
  return state as unknown as GuestDeliveryState;
}

export const getGuestObjectiveDelivery = createServerFn({ method: "GET" })
  .inputValidator(validateRequest)
  .handler(async ({ data }) => projectGuestDelivery(data.requestId, data.guestToken, false));

export const prepareGuestObjectiveDelivery = createServerFn({ method: "POST" })
  .inputValidator(validateRequest)
  .handler(async ({ data }) => projectGuestDelivery(data.requestId, data.guestToken, data.retry));
