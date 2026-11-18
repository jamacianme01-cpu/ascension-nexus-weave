# ASCENSION V1 — existing authored engine source and Fly boundary

## The engine source was found, not lost

Verified canonical authored source path in the owner's original development system:

`C:\Users\Gordo\Projects\clarity\ASCENSION_CORE`

The supporting CLARITY orchestration modules reside in:

`C:\Users\Gordo\Projects\clarity\clarity`

The archived copies accessible to this repair work include:

- `ASCENSION_CORE_REVIEW.zip`, saved October 26, 2026. Includes
  `cloud_queue_worker.py`, `engine_mesh.py`, `objective_runtime.py`,
  `governed_closure.py`, `knowledgeverse_runtime.py` and related modules.
  Those files are **historical**, not proven to equal the current local source.
- `clarity_code_20260913_151641.zip`, full September 13 source archive,
  including CLARITY support Python modules and earlier ASCENSION_CORE modules.
- `ASCENSION_EXECUTION_FIX(1).zip`, October 18 source updates, already
  reflected in the October 26 review copy.

The **private GitHub repository `jamacianme01-cpu/ascensionweave` is empty**.
That does NOT mean `ASCENSION_CORE` is empty. Its main branch cannot be used
as a source checkout for Fly. In particular, **never attempt to deploy it** as
a replacement for the current engines, and do not create an empty or demo
engine package to satisfy a deployment check.

## Preserve the existing working deployment

Current production Fly files `Dockerfile`, `fly.toml`, and
`.github/workflows/deploy-ascension-fly.yml` are retained exactly as on
`main` in this repair PR. No new Fly engine worker has been enabled.

## Existing engine architecture (do not replace)

The existing web intake queues objectives through
`/api/public/ascension/execution-queue`. The authored
`ASCENSION_CORE.cloud_queue_worker` is the real outbound-only bridge to
`objective_intake`, `objective_runtime`, Meaning Elements, engine mesh,
Guardian, AutoSync, live Knowledgeverse and the governed ledger. It is not
an LLM and cannot be replaced by a placeholder or a web-only queue poller.

The deployed Fly process eventually needs the **current exact authored source**
AND its **authoritative persisted governed state**, not a new blank state
folder or historical `state_demo`. The running worker must use Fly-hosted
compute, never the owner's old computer as a production dependency.

## Safe handoff from the original source

`scripts/export-existing-ascension-source.ps1` verifies the current
`ASCENSION_CORE` and `clarity` files in the canonical project and creates
a source-only ZIP and SHA256 inventory. It is read-only against the original
project, excludes the live state and secrets, does not contact Fly and does
not upload files to public GitHub. It is **not** itself the deployment.

A proper private deployment source can be prepared from that exact live
tree only after its provenance and completeness have been established.
Do not promote archived engine code as though it were current. Migration
of the authoritative live governed state is a separate controlled step.

The connected tools in this environment expose GitHub but no Fly.io
deployment connection or access to the owner's Windows files. Therefore no
claim is made that the private source, credentials or Knowledgeverse memory
have been migrated, or that ASCENSION engines are running on Fly.

**Owner's steps 2–7 remain pending until a real arbitrary objective is run
through the hosted existing engines and the four actual pathways, selected
picture, and Tree's spoken explanation are demonstrated.**
