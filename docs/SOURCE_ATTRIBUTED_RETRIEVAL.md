# ASCENSION source-attributed retrieval adapter

## Architectural boundary

This change extends the **existing** `src/lib/ascension/engine/knowledge.server.ts` and `zai.server.ts` integration. It does **not** instantiate replacement Knowledgeverse, Meaning Element, Spiral, Outcome Predictor, Confidence, Contradiction, Guardian, AutoSync or execution engines. Their authoritative Python implementations live in the operator's separate local `C:\Users\Gordo\Projects\clarity\ASCENSION_CORE` repository and were not available through this GitHub connection. Full core integration and a *live governed* end-to-end proof therefore remain **unverified**.

The web client submits objectives to `ascension_execution_requests` with `engine=governed_runtime`. The secured execution queue remains the sole writeback route for governed results. Web drafts are still external/unverified. The approved Tree visual code is unchanged.

## Retrieval and provenance

1. Existing internal adapter reads the published Observation Gateway relay surfaces (`/snapshot`, `/knowledgeverse`, `/pathways`, `/governance`, `/ledger`, `/chamber`). It returns source path, recorded classification, ingestion time and coherent snapshot revision when available. A path containing `ledger` or `verified_delta` no longer gets mislabeled independently verified by a filename heuristic.
2. External adapters query the public English Wikipedia search REST endpoint and Crossref scholarly **metadata** REST endpoint. Each returns a bounded excerpt, publisher, HTTPS source link, retrieval identifier and `external_unverified` status. Crossref titles/DOIs establish publication records; they do not establish or summarize full-text research findings.
3. The existing `callZai` consumer uses those excerpts as **untrusted context**. The language-model output can reference `[E1]` etc.; unsupported markers are removed. The server, not the model, appends the exact retrieved source URLs after any answer or Spiral/meaning repair.
4. Missing/upstream-failed sources remain missing. Retrieval never sets runtime status, evidence receipts, Guardian approval, AutoSync verification or earned Delta. Existing Spiral and Outcome Predictor context from the governed result is still consumed independently.

## Deployment

Set `ASCENSION_EXTERNAL_KNOWLEDGE_ENABLED=true` in the **server** environment to authorize external lookup. Default is disabled to avoid silently sending potentially personal objectives to third-party services. Requests use only the short `knowledgeQuery`, not the Library Card, history, submitted evidence or full model stage prompt. Searches are capped (180 characters, 3 results per adapter, 6 total, 4.5 second deadline per provider). No additional API keys, migrations, images or paid inference route are needed. Upstream providers may rate-limit or block access; no source is fabricated as a fallback.

The following is a **mocked transport demonstration**, not a claim about the production deployment:

```sh
npm run test:interface
npm run build
npx tsc --noEmit
```

`tests/knowledge-retrieval.test.mjs` mocks the actual Wikipedia/Crossref response formats plus the existing cloud model transport to validate source attribution, independent provider failure, unsupported citation removal, and provider-input opt-in. Those tests cannot prove that the configured deployment or local governed Python worker is running; only live credentials, deployed settings and a real governed acceptance receipt can do that.

## Remaining core proof requirements

Inspect the actual local implementations of `ASCENSION_CORE` Knowledge Retrieval, Knowledgeverse, Meaning Elements, Spiral, Outcome Predictor, Confidence, Contradiction, Guardian and AutoSync. Then run a signed objective through the queue worker and demonstrate retrieved source IDs remaining traceable through ME reasoning, multiple Spiral pathways, outcome/confidence/contradiction evaluation, Guardian, independent execution evidence, AutoSync verification and persisted Delta. Do not promote the simulated/mock model test to `ASCENSION_VERIFIED_PERSISTED`.
