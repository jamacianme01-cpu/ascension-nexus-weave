/** ASCENSION execution request queue — independent, no third-party database. */
import { randomUUID } from "node:crypto";

export type ExecutionRequest = {
  id: string;
  submitted_by: string;
  submitted_via: string;
  objective: string;
  evidence: string[] | null;
  constraints: string[] | null;
  status: "queued" | "claimed" | "running" | "verified" | "rejected" | "failed";
  stage: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  completed_at: string | null;
  runtime_revision: string | null;
  transition_id: string | null;
  accepted_delta: unknown;
  guardian_verdict: unknown;
  outcome_status: string | null;
  result: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
);

const store = new Map<string, ExecutionRequest>();

export function submitRequest(input: {
  submitted_by: string;
  submitted_via: string;
  objective: string;
  evidence?: string[] | null;
  constraints?: string[] | null;
)): ExecutionRequest {
  const now = new Date().toISOString();
  const req: ExecutionRequest = {
    id: randomUUID(),
    submitted_by: input.submitted_by,
    submitted_via: input.submitted_via,
    objective: input.objective,
    evidence: input.evidence ?? null,
    constraints: input.constraints ?? null,
    status: "queued",
    stage: null,
    claimed_at: null,
    claimed_by: null,
    completed_at: null,
    runtime_revision: null,
    transition_id: null,
    accepted_delta: null,
    guardian_verdict: null,
    outcome_status: null,
    result: null,
    error: null,
    created_at: now,
    updated_at: now,
  };
  store.set(req.id, req);
  return req;
)

export function getRequest(id: string): ExecutionRequest | undefined {
  return store.get(id);
)

export function listRequests(options: { userId?: string; limit?: number } = {}): ExecutionRequest[] {
  const { userId, limit = 10 } = options;
  let items = [...store.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  if (userId) items = items.filter((r) => r.submitted_by === userId);
  return items.slice(0, Math.min(Math.max(limit, 1), 50));
}
