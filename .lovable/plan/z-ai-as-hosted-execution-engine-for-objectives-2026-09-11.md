# Z.AI as hosted execution engine for objectives

Today an objective submitted on ascensionweave.app just waits in a queue for the runtime on your own computer to claim it. Nothing runs unless that machine is on. This adds a hosted engine so an objective is processed in the cloud, with every stage stored and shown — and with labels that keep engine output clearly separate from real ASCENSION state.

## Labelling rule (non-negotiable)

Engine output is never presented as ASCENSION state. Five distinct labels, exactly as you specified:

- `ASCENSION · LIVE_GOVERNED` — the governed state read through the gateway/relay. Untouched by this work.
- `Z.AI · EXTERNAL RESULT` — raw response returned by the engine.
- `Z.AI · VERIFICATION PENDING` — result currently being checked.
- `Z.AI · VERIFIED EXTERNAL RESULT` — passed AutoSync + Guardian checks; disposition "Accepted as Evidence".
- `ASCENSION · VERIFIED / PERSISTED` — only set when the governed core commits it. The hosted engine can never set this.

Lineage is shown end to end: source → external result → AutoSync → Guardian → accepted evidence → state transition → Verified Δ → persisted state. Stages that have not happened read `unavailable`, never a guessed value.

## Staged cycle

Each submitted objective runs as an ordered chain of engine calls, each one persisted before the next begins:

1. Meaning Element decomposition
2. DTF branch generation
3. Branch evaluation (confidence per branch)
4. Guardian review (pass / block, with reasons)
5. Selection
6. Execution reasoning
7. AutoSync verification against the submitted evidence
8. Δ statement

If Guardian blocks, the chain stops there and the run is marked blocked, not verified. Any engine failure is stored as an error on the run and shown; it is never smoothed over.

## What you will see

On `/objectives`: submit an objective as today, then watch the run advance stage by stage, each stage expandable with its own engine output and its own label. A run that completes reads `Z.AI · VERIFIED EXTERNAL RESULT` with AutoSync and Guardian verdicts and the Δ — and a clear note that it is not yet accepted into governed ASCENSION state.

Existing surfaces (Chamber, Knowledgeverse, Pathways, Governance, Verified Δ) and their live/demo behaviour are untouched.

## Technical notes

- New table `ascension_run_stages` (run id, ordinal, stage name, engine label, status, request/response payload, engine model, duration, error) with RLS scoped to the submitting user; grants for `authenticated` and `service_role`. `ascension_execution_requests` gains `engine` (`zai` | `governed_runtime`), `engine_status`, `epistemic_label`.
- New `src/lib/ascension/engine/zai.server.ts` — server-only Z.AI client (streamed, no timer aborts, gateway-style error semantics surfaced verbatim).
- New `src/lib/ascension/engine/cycle.server.ts` — the eight-stage chain, one stage persisted per step; pure orchestration, no value invention.
- `src/lib/ascension/objectives.functions.ts` — `submitObjective` optionally starts a hosted run; add `listRunStages`.
- New `src/routes/api/public/ascension/engine-step.ts` — token-protected step driver so a run advances without holding one long HTTP request.
- `src/routes/_authenticated/objectives.tsx` — stage timeline and the five labels.
- `src/lib/mcp/tools/execute.ts` / `run-status.ts` — add an `engine` choice and return stage/label data. The local-runtime queue path stays exactly as-is.
- Unchanged: gateway/relay reads, demo isolation, auth, publish token, governed core.

## What I need from you

A Z.AI API key. I will request it as a secret when the build starts; without it the hosted engine cannot run and objectives keep queueing for your runtime.

## Verification

A real end-to-end run on the published site: submitted objective, request id, each stage transition, engine responses, Guardian verdict, AutoSync outcome, Δ, and the final label — plus proof that no run is ever labelled `ASCENSION · VERIFIED / PERSISTED` by the hosted engine.
