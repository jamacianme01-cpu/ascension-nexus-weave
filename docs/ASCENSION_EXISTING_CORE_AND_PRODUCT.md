# ASCENSION existing core and product contract

Inspected from `clarity_code_20260913_151641.zip` and the existing connected web repository on September 13, 2026.

## Ownership

CLARITY orchestrates. ASCENSION is the reality runtime. OMNI mediates the interface. ID preserves identity and continuity; SID is the embodiment or signature used for experience. Meaning Elements preserve meaning; verified Δ records transformation in Knowledge, Wisdom and Understanding.

The authoritative repository is `C:\Users\Gordo\Projects\clarity`. This web repository consumes it; it must not recreate or silently replace the governed core.

## Existing connections

| Existing core module | Role available to the interface |
| --- | --- |
| `ASCENSION_CORE/observation_gateway.py` | Read-only observation v1 API; canonical, hash-checked snapshots; separate controller publication |
| `ASCENSION_CORE/cloud_queue_worker.py` | Outbound authenticated queue claim, durable local intake, governed processing, terminal reporting |
| `ASCENSION_CORE/objective_intake.py` | Signed local objective intake and durable request correlation |
| `ASCENSION_CORE/objective_runtime.py` | Existing Meaning Element / pathway planning, authorized artifact execution and evidence readback |
| `ASCENSION_CORE/live_publication.py` | Persisted governed publication consumed by the gateway |
| `ASCENSION_CORE/knowledgeverse_runtime.py` | Forms, chromosomes, phenotype, relationships, emergence and lineage |
| `ASCENSION_CORE/manifestation_bridge.py` | Existing Unreal manifestation boundary |

The uploaded archive contains a valid publication at revision 18. It has three forms, one relationship, Library Cards, chromosomes, recorded emergence, and lineage. Those are archive observations, not proof that the user's PC is currently reachable.

## Product behavior

The main screen is objective → ENGAGE ASCENSION → usable result, with Continue / Refine / Execute. Preserve the faint chamber background. Keep engine details in optional reasoning, pathways, verification and Inspect surfaces.

The external Z.AI client is already part of this web repository. The product result stage uses that client to return a readable answer or complete draft files. It writes only `ascension_run_stages`, ordinal 100, labelled `ZAI_EXTERNAL_RESULT`; it never changes governed run status, awards Δ, or treats generation as execution. Downloads contain the produced text and are not executed in the browser.

`ASCENSION_CORE` still owns execution and verification. A saved run in the inspected archive verified a Meaning Element document and its metadata. That does not establish that the user's full objective was accomplished. The UI must state the actual scope of the receipt. External engine results remain unverified until independently verified by a supported core capability.

Follow-ups retain the parent request and prior generated result as explicitly unverified submitted context. The parent is resolved through the caller's authenticated session. This interface cannot force the core to select a particular branch or add execution capabilities.

## Exact data mapping

- Forms and chromosomes come from the verified snapshot, not the legacy fixture-shaped empty containers.
- Library Cards come from `governed_state.library_cards`, coherent with that snapshot.
- Persistent ID, current SID, developmental state, active MEs, phenotype, lineage events and verified Δ preserve their published fields.
- Relationships use published `source`, `target`, `relationship_id`, `relation_type`; duplicates referenced by both forms are rendered once.
- `objective_planning.selected_branch.branch_id` identifies the selected branch. `approach`, `actions` and `risks` describe the future.
- Forms with no relationships still appear. Missing properties remain unavailable.
- Tree geometry is display layout. Selecting a node changes focus, not governed state. New publications update the world. Labels and Library Cards can be toggled.
- LIVE_GOVERNED, historical last-verified state, LIVE_CONTROLLER and DEMO must remain distinct.

## Existing deployment requirements

The Lovable environment supplies its existing Supabase configuration and `ZAI_API_KEY`. The local queue worker uses the already established `ASCENSION_PUBLISH_TOKEN`. No additional database migration is needed: `ascension_run_stages` and its owner-scoped read policy were created on September 11.

No core, Unreal, CAD, Guardian, AutoSync, DTF, Galaxy Bridge, ID/SID or Meaning Element implementation was modified in this change. A production build and interface tests do not prove the operator's local worker is online. The live ASCENSION connector check stalled during this session and could not establish that connection.

## Validation

Run `npm run test:interface`, `npx tsc --noEmit`, and `npm run build`. The interface tests use selected records from the uploaded publication and explicitly test missing persistence, external-result isolation, recorded branch identity, source separation, safe downloads, and streamed result/error handling. A browser proof harness was prepared with mocked authenticated transport and archived form data, but the browser executable was unavailable and its download timed out. Browser interaction and visual QA therefore remain unverified. No production objectives were submitted during testing.
