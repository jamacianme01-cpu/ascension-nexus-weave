/**
 * Hosted execution cycle driver.
 *
 * Runs ONE stage of the canonical chain per call and persists it before
 * returning, so no single request holds a long connection open. Every value
 * stored here comes from the external Z.AI engine verbatim — this module
 * decides nothing, verifies nothing itself, and can never mark a run as
 * ASCENSION · VERIFIED / PERSISTED. That label belongs to the governed core
 * alone.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { EPISTEMIC_LABELS, STAGE_CHAIN, type StageSpec } from "./stages";
import { callZai, ZaiEngineError, zaiModel } from "./zai.server";

const SYSTEM = [
  "You are an external reasoning engine invoked by the ASCENSION governed system.",
  "You are NOT ASCENSION. Your output is external evidence, never governed state.",
  "Answer with a single JSON object only — no prose outside it, no code fences.",
  "Never invent facts, sources, verification results or guarantees. If something",
  "cannot be determined from the submitted objective, evidence and constraints,",
  'set the field to the string "unavailable" and say why in the "notes" field.',
].join(" ");

interface RunRow {
  id: string;
  objective: string;
  evidence: unknown;
  constraints: unknown;
  status: string;
  engine: string;
}

interface StageRow {
  ordinal: number;
  stage: string;
  status: string;
  response_payload: unknown;
  response_text: string | null;
}

function json(value: unknown): string {
  return value === null || value === undefined ? "unavailable" : JSON.stringify(value, null, 2);
}

function priorOutput(stages: StageRow[], stage: string): string {
  const row = stages.find((item) => item.stage === stage);
  if (!row) return "unavailable";
  return row.response_payload ? json(row.response_payload) : (row.response_text ?? "unavailable");
}

function promptFor(spec: StageSpec, run: RunRow, stages: StageRow[]): string {
  const header = [
    `OBJECTIVE:\n${run.objective}`,
    `SUBMITTED EVIDENCE:\n${json(run.evidence)}`,
    `SUBMITTED CONSTRAINTS:\n${json(run.constraints)}`,
  ].join("\n\n");

  const ask: Record<string, string> = {
    me_decomposition:
      'Decompose the objective into Meaning Elements. Return {"meaning_elements":[{"element":string,"who":string,"what":string,"why":string,"depends_on":[string]}],"notes":string}.',
    dtf_branches: `Prior Meaning Element decomposition:\n${priorOutput(stages, "me_decomposition")}\n\nGenerate distinct Dimensional Transverse Framework branches — candidate pathways from the objective to an outcome. Return {"branches":[{"id":string,"pathway":string,"preconditions":[string],"risks":[string]}],"notes":string}.`,
    branch_evaluation: `Branches:\n${priorOutput(stages, "dtf_branches")}\n\nEvaluate each branch against the objective, evidence and constraints. Confidence is 0..1 and must be justified by the submitted material only. Return {"evaluations":[{"id":string,"confidence":number,"rationale":string,"constraint_conflicts":[string]}],"notes":string}.`,
    guardian_review: `Branches:\n${priorOutput(stages, "dtf_branches")}\n\nEvaluations:\n${priorOutput(stages, "branch_evaluation")}\n\nAct as Guardian review: block anything that violates the submitted constraints, requires fabricated evidence, or would cause irreversible harm. Return {"verdict":"pass"|"block","blocked_branches":[string],"reasons":[string],"notes":string}.`,
    selection: `Evaluations:\n${priorOutput(stages, "branch_evaluation")}\n\nGuardian review:\n${priorOutput(stages, "guardian_review")}\n\nSelect one branch that Guardian did not block. Return {"selected_branch":string,"confidence":number,"why_selected":string,"rejected":[{"id":string,"why":string}],"notes":string}.`,
    execution: `Selection:\n${priorOutput(stages, "selection")}\n\nProduce the execution reasoning for the selected branch: the ordered steps, what each step changes, and what evidence each step would produce. You are not performing the steps. Return {"steps":[{"step":string,"changes":string,"expected_evidence":string}],"outcome_statement":string,"notes":string}.`,
    autosync_verification: `Execution reasoning:\n${priorOutput(stages, "execution")}\n\nSubmitted evidence is the only evidence that exists. Verify the execution reasoning against it: every claim either is supported by submitted evidence, or is unsupported. Return {"autosync":"passed"|"failed","supported":[string],"unsupported":[string],"evidence_gaps":[string],"notes":string}.`,
    delta: `Execution reasoning:\n${priorOutput(stages, "execution")}\n\nAutoSync verification:\n${priorOutput(stages, "autosync_verification")}\n\nState the Δ — the difference between the state before and after this run, limited to what the verification supports. Return {"delta":{"before":string,"after":string,"magnitude":string},"disposition":"accepted_as_evidence","limits":[string],"notes":string}.`,
  };

  return `${header}\n\n${ask[spec.stage] ?? "Return {\"notes\":string}."}`;
}

export interface AdvanceResult {
  done: boolean;
  status: string;
  stage: string | null;
  ordinal: number;
  total: number;
  epistemic_label: string | null;
  error: string | null;
}

async function finish(
  requestId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("ascension_execution_requests")
    .update(patch as never)
    .eq("id", requestId);
  if (error) throw new Error(error.message);
}

/** Runs the next unfinished stage of a hosted run. Idempotent per ordinal. */
export async function advanceRun(requestId: string): Promise<AdvanceResult> {
  const { data: run, error: runError } = await supabaseAdmin
    .from("ascension_execution_requests")
    .select("id, objective, evidence, constraints, status, engine")
    .eq("id", requestId)
    .maybeSingle();
  if (runError) throw new Error(runError.message);
  if (!run) throw new Error("Request not found.");
  const typedRun = run as unknown as RunRow;
  if (typedRun.engine !== "zai") {
    throw new Error("This submission is queued for the governed runtime, not the hosted engine.");
  }

  const { data: stageData, error: stageError } = await supabaseAdmin
    .from("ascension_run_stages")
    .select("ordinal, stage, status, response_payload, response_text")
    .eq("request_id", requestId)
    .order("ordinal", { ascending: true });
  if (stageError) throw new Error(stageError.message);
  const stages = (stageData ?? []) as unknown as StageRow[];

  const terminal = ["verified", "rejected", "failed"];
  if (terminal.includes(typedRun.status)) {
    return {
      done: true,
      status: typedRun.status,
      stage: stages.at(-1)?.stage ?? null,
      ordinal: stages.length,
      total: STAGE_CHAIN.length,
      epistemic_label: null,
      error: null,
    };
  }

  const completed = stages.filter((item) => item.status === "completed").length;
  const spec = STAGE_CHAIN[completed];
  if (!spec) {
    return {
      done: true,
      status: typedRun.status,
      stage: null,
      ordinal: completed,
      total: STAGE_CHAIN.length,
      epistemic_label: null,
      error: null,
    };
  }

  await finish(requestId, {
    status: "running",
    stage: spec.stage,
    engine_status: `running · ${spec.stage}`,
    epistemic_label: spec.label,
    claimed_by: `zai:${zaiModel()}`,
    claimed_at: new Date().toISOString(),
  });

  const prompt = promptFor(spec, typedRun, stages);

  let result;
  try {
    result = await callZai({ system: SYSTEM, user: prompt });
  } catch (cause) {
    const message =
      cause instanceof ZaiEngineError
        ? cause.message
        : cause instanceof Error
          ? cause.message
          : String(cause);
    await supabaseAdmin.from("ascension_run_stages").upsert(
      {
        request_id: requestId,
        ordinal: spec.ordinal,
        stage: spec.stage,
        engine_label: spec.label,
        status: "failed",
        engine_model: zaiModel(),
        request_payload: { system: SYSTEM, user: prompt } as never,
        error: message,
        completed_at: new Date().toISOString(),
      } as never,
      { onConflict: "request_id,ordinal" },
    );
    await finish(requestId, {
      status: "failed",
      engine_status: `failed · ${spec.stage}`,
      error: message,
      completed_at: new Date().toISOString(),
    });
    return {
      done: true,
      status: "failed",
      stage: spec.stage,
      ordinal: spec.ordinal,
      total: STAGE_CHAIN.length,
      epistemic_label: spec.label,
      error: message,
    };
  }

  const payload = result.json;
  const verdict = typeof payload?.["verdict"] === "string" ? String(payload["verdict"]) : null;
  const autosync = typeof payload?.["autosync"] === "string" ? String(payload["autosync"]) : null;
  const blocked = spec.stage === "guardian_review" && verdict === "block";
  const failedVerification = spec.stage === "autosync_verification" && autosync === "failed";

  await supabaseAdmin.from("ascension_run_stages").upsert(
    {
      request_id: requestId,
      ordinal: spec.ordinal,
      stage: spec.stage,
      engine_label: blocked || failedVerification ? EPISTEMIC_LABELS.rejected : spec.label,
      status: blocked || failedVerification ? "blocked" : "completed",
      engine_model: result.model,
      request_payload: { system: SYSTEM, user: prompt } as never,
      response_payload: (payload ?? null) as never,
      response_text: result.text,
      duration_ms: result.duration_ms,
      completed_at: new Date().toISOString(),
    } as never,
    { onConflict: "request_id,ordinal" },
  );

  if (blocked || failedVerification) {
    const label = EPISTEMIC_LABELS.rejected;
    await finish(requestId, {
      status: "rejected",
      stage: spec.stage,
      engine_status: blocked ? "blocked · guardian" : "failed · autosync verification",
      epistemic_label: label,
      guardian_verdict: blocked ? "block" : undefined,
      outcome_status: blocked ? "guardian_blocked" : "autosync_failed",
      result: payload as never,
      completed_at: new Date().toISOString(),
    });
    return {
      done: true,
      status: "rejected",
      stage: spec.stage,
      ordinal: spec.ordinal,
      total: STAGE_CHAIN.length,
      epistemic_label: label,
      error: null,
    };
  }

  if (spec.stage === "guardian_review") {
    await finish(requestId, { guardian_verdict: verdict ?? "unavailable" });
  }

  const last = spec.ordinal === STAGE_CHAIN.length;
  if (last) {
    await finish(requestId, {
      status: "verified",
      stage: spec.stage,
      engine_status: "complete · external result verified against submitted evidence",
      epistemic_label: EPISTEMIC_LABELS.verified,
      outcome_status: "accepted_as_evidence",
      accepted_delta: (payload?.["delta"] ?? null) as never,
      result: payload as never,
      completed_at: new Date().toISOString(),
    });
    return {
      done: true,
      status: "verified",
      stage: spec.stage,
      ordinal: spec.ordinal,
      total: STAGE_CHAIN.length,
      epistemic_label: EPISTEMIC_LABELS.verified,
      error: null,
    };
  }

  await finish(requestId, { engine_status: `completed · ${spec.stage}` });
  return {
    done: false,
    status: "running",
    stage: spec.stage,
    ordinal: spec.ordinal,
    total: STAGE_CHAIN.length,
    epistemic_label: spec.label,
    error: null,
  };
}
