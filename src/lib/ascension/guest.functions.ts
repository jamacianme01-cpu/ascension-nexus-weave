import { createServerFn } from "@tanstack/react-start";

import type { Json } from "@/integrations/supabase/types";
import type { ObjectiveRun } from "./objectives.functions";
import type { ObjectiveDelivery } from "./result-model";

const GUEST_EMAIL = "ascension-book-guest@users.invalid";
const DELIVERY_ORDINAL = 100;

async function guestOwnerId(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const findGuest = async () => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(error.message);
    return data.users.find((user) => user.email?.toLowerCase() === GUEST_EMAIL);
  };

  const existing = await findGuest();
  if (existing) return existing.id;

  const password = `Ascension-${crypto.randomUUID()}-aA1!`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: GUEST_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { ascension_book_guest: true },
  });

  if (!error && data.user) return data.user.id;

  // A simultaneous first guest request may have created the shared guest user.
  const raced = await findGuest();
  if (raced) return raced.id;
  throw new Error(error?.message ?? "ASCENSION guest access could not be established.");
}

function validateRequestId(input: { requestId: string; retry?: boolean }) {
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId)) throw new Error("A valid request id is required.");
  return { requestId: input.requestId, retry: input.retry === true };
}

function hasDownloadableFiles(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const files = (value as Record<string, unknown>)["files"];
  return Array.isArray(files) && files.length > 0;
}

export interface GuestDeliveryState {
  created_at: string;
  status: string;
  response_payload: ObjectiveDelivery | null;
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
        followUp: input.followUp ?? null,
      };
    },
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerId = await guestOwnerId();
    let evidence = data.evidence;

    if (data.parentRequestId) {
      if (
        !/^[a-f0-9-]{36}$/i.test(data.parentRequestId) ||
        !["continue", "refine"].includes(data.followUp ?? "")
      ) {
        throw new Error("Invalid follow-up reference.");
      }

      const { data: parent, error: parentError } = await supabaseAdmin
        .from("ascension_execution_requests")
        .select("id, objective, result")
        .eq("id", data.parentRequestId)
        .eq("submitted_by", ownerId)
        .maybeSingle();
      if (parentError) throw new Error(parentError.message);
      if (!parent) throw new Error("The earlier objective is unavailable.");

      const { data: delivery, error: deliveryError } = await supabaseAdmin
        .from("ascension_run_stages")
        .select("response_payload")
        .eq("request_id", parent.id)
        .eq("ordinal", DELIVERY_ORDINAL)
        .eq("status", "completed")
        .maybeSingle();
      if (deliveryError) throw new Error(deliveryError.message);

      const contextText = JSON.stringify({
        parent_request_id: parent.id,
        requested_action: data.followUp,
        prior_objective: parent.objective,
        prior_result: delivery?.response_payload ?? null,
        verification: "Prior result supplied as continuation context.",
      });
      evidence = [...(evidence ?? []), contextText];
    }

    const { data: row, error } = await supabaseAdmin
      .from("ascension_execution_requests")
      .insert({
        engine: "governed_runtime",
        submitted_by: ownerId,
        submitted_via: "web_guest",
        objective: data.objective,
        evidence: evidence as Json | null,
        constraints: data.constraints as Json | null,
      })
      .select(
        "engine, id, objective, evidence, constraints, status, stage, claimed_at, claimed_by, completed_at, runtime_revision, transition_id, guardian_verdict, outcome_status, accepted_delta, result, error, created_at, updated_at",
      )
      .single();

    if (error) throw new Error(error.message);
    return { accepted: true, executed_here: false, request: row as ObjectiveRun };
  });

export const getGuestObjectiveStatus = createServerFn({ method: "GET" })
  .inputValidator(validateRequestId)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerId = await guestOwnerId();
    const { data: row, error } = await supabaseAdmin
      .from("ascension_execution_requests")
      .select(
        "engine, id, objective, evidence, constraints, status, stage, claimed_at, claimed_by, completed_at, runtime_revision, transition_id, guardian_verdict, outcome_status, accepted_delta, result, error, created_at, updated_at",
      )
      .eq("id", data.requestId)
      .eq("submitted_by", ownerId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return { request: (row as ObjectiveRun | null) ?? null };
  });

export const getGuestObjectiveDelivery = createServerFn({ method: "GET" })
  .inputValidator(validateRequestId)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerId = await guestOwnerId();

    const { data: run, error: runError } = await supabaseAdmin
      .from("ascension_execution_requests")
      .select("id, objective, evidence, constraints, result, submitted_by")
      .eq("id", data.requestId)
      .eq("submitted_by", ownerId)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (!run) return null;

    const { data: row, error } = await supabaseAdmin
      .from("ascension_run_stages")
      .select("status, response_payload, error, engine_model, engine_label, created_at")
      .eq("request_id", data.requestId)
      .eq("ordinal", DELIVERY_ORDINAL)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (
      row?.status === "completed" &&
      row.engine_label === "GOVERNED_RUNTIME_RESULT_V2" &&
      hasDownloadableFiles(row.response_payload)
    ) {
      return row as unknown as GuestDeliveryState;
    }

    const { prepareDelivery } = await import("./engine/delivery.server");
    return (await prepareDelivery(run, false)) as unknown as GuestDeliveryState | null;
  });

export const prepareGuestObjectiveDelivery = createServerFn({ method: "POST" })
  .inputValidator(validateRequestId)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerId = await guestOwnerId();

    const { data: run, error } = await supabaseAdmin
      .from("ascension_execution_requests")
      .select("id, objective, evidence, constraints, result, engine, status, submitted_by")
      .eq("id", data.requestId)
      .eq("submitted_by", ownerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("This objective is unavailable.");

    const { prepareDelivery } = await import("./engine/delivery.server");
    return prepareDelivery(run, data.retry);
  });
