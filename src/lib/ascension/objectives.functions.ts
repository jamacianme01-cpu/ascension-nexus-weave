import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

/**
 * Authenticated objective intake and run-status reads.
 *
 * These are the web-layer twins of the MCP tools ascension_execute and
 * ascension_run_status. Submitting records a signed SUBMISSION only; the
 * governed ASCENSION runtime claims it through the secured bridge
 * (/api/public/ascension/execution-queue), runs its own cycle and writes back
 * stage, Guardian verdict, outcome, accepted Δ and result. Nothing here
 * executes, evaluates, verifies or infers any of those values.
 */

export interface ObjectiveRun {
  engine: string;
  id: string;
  objective: string;
  evidence: Json | null;
  constraints: Json | null;
  status: string;
  stage: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  completed_at: string | null;
  runtime_revision: number | null;
  transition_id: string | null;
  guardian_verdict: string | null;
  outcome_status: string | null;
  accepted_delta: Json | null;
  result: Json | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const RUN_COLUMNS =
  "engine, id, objective, evidence, constraints, status, stage, claimed_at, claimed_by, completed_at, runtime_revision, transition_id, guardian_verdict, outcome_status, accepted_delta, result, error, created_at, updated_at";

export const submitObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      objective: string;
      evidence?: string[];
      constraints?: string[];
      parentRequestId?: string;
      followUp?: "continue" | "refine" | "simulate" | "execute";
      selectedPathwayId?: string;
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
        parentRequestId: input.parentRequestId ?? null,
        followUp: input.followUp ?? null,
        selectedPathwayId: input.selectedPathwayId?.trim().slice(0, 200) || null,
        objective: objective.slice(0, 4000),
        evidence: clean(input.evidence, 2000),
        constraints: clean(input.constraints, 500),
      };
    },
  )
  .handler(async ({ data, context }) => {
    let evidence = data.evidence;
    if (data.parentRequestId) {
      if (
        !/^[a-f0-9-]{36}$/i.test(data.parentRequestId) ||
        !["continue", "refine", "simulate", "execute"].includes(data.followUp ?? "")
      )
        throw new Error("Invalid follow-up reference.");
      const { data: parent, error: parentError } = await context.supabase
        .from("ascension_execution_requests")
        .select("id, objective, result")
        .eq("id", data.parentRequestId)
        .eq("submitted_by", context.userId)
        .maybeSingle();
      if (parentError) throw new Error(parentError.message);
      if (!parent) throw new Error("The earlier objective is unavailable to your account.");
      const { data: delivery, error: deliveryError } = await context.supabase
        .from("ascension_run_stages")
        .select("response_payload")
        .eq("request_id", parent.id)
        .eq("ordinal", 100)
        .eq("status", "completed")
        .maybeSingle();
      if (deliveryError) throw new Error(deliveryError.message);
      const contextText = JSON.stringify({
        parent_request_id: parent.id,
        requested_action: data.followUp,
        user_selected_pathway_id: data.selectedPathwayId,
        selection_authority: data.selectedPathwayId ? "USER_SELECTED" : "NO_USER_SELECTION",
        prior_objective: parent.objective,
        prior_result: delivery?.response_payload ?? null,
        verification: "External draft supplied as context only; not verified evidence.",
      });
      if (contextText.length > 60000)
        throw new Error(
          "The earlier result is too large to include in one follow-up. Refine the supporting context first.",
        );
      evidence = [...(evidence ?? []), contextText];
    }
    const { data: row, error } = await context.supabase
      .from("ascension_execution_requests")
      .insert({
        engine: "governed_runtime",
        submitted_by: context.userId,
        submitted_via: "web",
        objective: data.objective,
        evidence,
        constraints: data.constraints,
      })
      .select(RUN_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { accepted: true, executed_here: false, request: row as ObjectiveRun };
  });

export const listMyObjectives = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ascension_execution_requests")
      .select(RUN_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { items: (data ?? []) as ObjectiveRun[] };
  });

export const getObjectiveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string }) => {
    const requestId = input.requestId?.trim();
    if (!requestId) throw new Error("A request id is required.");
    return { requestId };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ascension_execution_requests")
      .select(RUN_COLUMNS)
      .eq("id", data.requestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { request: (row as ObjectiveRun | null) ?? null };
  });
