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
  "id, objective, evidence, constraints, status, stage, claimed_at, claimed_by, completed_at, runtime_revision, transition_id, guardian_verdict, outcome_status, accepted_delta, result, error, created_at, updated_at";

export const submitObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { objective: string; evidence?: string[]; constraints?: string[] }) => {
    const objective = input.objective?.trim();
    if (!objective) throw new Error("An objective statement is required.");
    const clean = (list: string[] | undefined, max: number) => {
      const items = (list ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 32);
      return items.length ? items.map((item) => item.slice(0, max)) : null;
    };
    return {
      objective: objective.slice(0, 4000),
      evidence: clean(input.evidence, 2000),
      constraints: clean(input.constraints, 500),
    };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ascension_execution_requests")
      .insert({
        submitted_by: context.userId,
        submitted_via: "web",
        objective: data.objective,
        evidence: data.evidence,
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
