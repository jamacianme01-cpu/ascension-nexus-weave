# ASCENSION V1 — Architecture Recovery and Requirements Map

**Date:** 2026-11-19  
**Source baseline:** Owner-provided `ASCENSION_FULL_ENGINE_SOURCE_RECOVERY_20261119.zip` (export from `ASCENSION_CURRENT_LIVE_20261118_070627.zip`, classified LIVE_GOVERNED, publication revision 124) + public web repository `ascension-nexus-weave`.  
**Status:** Recovery analysis only. No checklist item beyond owner-approved item 1 is marked complete.

This document binds the owner’s V1 functional requirements to the actual recovered source. It does not invent engines, pathways, or capabilities.

---

## 1. Owner V1 functional requirements (authoritative)

From the owner’s specification (2026-11-19):

1. Opening experience: original Book + Tree of Knowledge. Book categories include Business Planner, Build / Create, Guidance. Tree is the interactive spoken guide. No typing required. Preserve approved Book/Tree design; no unauthorized opening scene or welcome banners.
2. Objective: person speaks naturally. ASCENSION’s own engines analyze meaning, knowledge, relationships, capabilities, and outcomes. No external AI providers (ChatGPT, Grok, Claude, OpenAI, Z.AI, Lovable, etc.) as substitutes for those engines.
3. Exactly four pathways including BLEND. Original pathway definitions from source. Person free to select any pathway. Main pathway selection screen must not put invention pictures inside orbs before entry.
4. ENTER PATHWAY opens that pathway’s own design picture and explanation. Tree remains present and explains by voice.
5. Interactive inspection: Blueprint (real dimensions/measurements), Dissect, Exploded/Imploded, grab/rotate/zoom, component descriptions in a side list (not over the image). Tree can explain parts by voice. No unapproved extra V1 environments.
6. BUILD ON RESULT continues the selected design without starting the objective over. Retain design, objective, pathway, context, and prior work.
7. Memory and Knowledgeverse: original identity, meaning, relationships, memory, lineage, transformation, evolution. Distinguish proposed / simulated / executed / verified-persisted. No false claims of manufacture or verification.
8. Tree is the persistent spoken guide throughout pathway selection and inspection.
9. Acceptance: a person can complete the full loop listed by the owner (enter Book/Tree → speak objective → four genuine results including BLEND → enter pathway → see design + Tree explanation → inspect → BUILD ON RESULT → return via memory/Knowledgeverse).
10. Owner approval only: checklist at `docs/ASCENSION_V1_OWNER_APPROVAL_CHECKLIST.md`. Only item 1 is approved. Items 2–11 stay open until the owner sees the behavior and approves.

**Guiding statements:** Everything is connected. Evolution is key. Do not separate V1 from the intelligence the owner invented.

---

## 2. Recovered engine inventory (source-proven)

| Fact | Value |
|------|--------|
| Python source files | 366 (48 ASCENSION_CORE, 318 clarity) |
| Class definitions | 705 |
| Engine-named classes (Engine / EngineV2 / EngineAdapter) | 74 definitions / 69 distinct names |
| Engine contributions in `ASCENSION_CORE/engine_mesh.py` | 15 |
| Default registry from `clarity/core_runtime.py` | 13 |
| Chamber processing engines in `developmental_pipeline.py` | 6 |
| Declared OMNI stages | 82 |
| Static import edges | 263 |

Key original modules present in the recovery archive:

- `ASCENSION_CORE/capabilities.py` — capability contracts and `select_capability`
- `ASCENSION_CORE/engine_mesh.py` — pre-DTF objective analysis mesh
- `ASCENSION_CORE/objective_runtime.py` — governed objective execution path
- `ASCENSION_CORE/dtf.py` — PathwayPlanner, DTFBranch, branch comparison
- `ASCENSION_CORE/developmental_pipeline.py` — chamber engines + pathway generation
- `ASCENSION_CORE/knowledgeverse_runtime.py` + `knowledgeverse_types.py`
- `ASCENSION_CORE/galaxy_bridge.py`
- `ASCENSION_CORE/governed_closure.py`
- `ASCENSION_CORE/cloud_queue_worker.py`
- `ASCENSION_CORE/pathway_executor.py`
- `clarity/autosync/construction_engine.py` — **`UniversalConstructionEngine`** and construction tools
- Full AutoSync suite (MIPR, TwinLattice, Guardian, verification, etc.)

---

## 3. Exact defect causing BLOCKED_CAPABILITY_UNAVAILABLE

In recovered `ASCENSION_CORE/capabilities.py`:

```text
REGISTRY contains only:
  - digital_artifact_writer  (DigitalArtifactWriter)
  - document_bundle          (DocumentBundleCapability)

NON_DOCUMENT_OUTPUTS includes physical_design, software_design, cad,
simulation, generative_3d_form, image, video, audio, manufacturing,
robotics, hardware, …

select_capability():
  if contract not in DOCUMENT_OUTPUTS:
      return "unavailable:" + contract
```

In `ASCENSION_CORE/objective_runtime.py`, when the selected capability is not in REGISTRY the run returns:

```text
status: "BLOCKED_CAPABILITY_UNAVAILABLE"
reason: "No verified executor registered for requested output: <contract>."
```

**UniversalConstructionEngine exists** at `clarity/autosync/construction_engine.py` with create_job, run_job, run_twin_lattice, and tools for physical_design. It is **not registered** in `ASCENSION_CORE.capabilities.REGISTRY`.

There is no `SoftwareProjectCapability` in this recovery snapshot’s REGISTRY.

The Fly workflow correctly reported:

```text
ASCENSION_AUTHORED_PHYSICAL_EXECUTOR_MISSING: physical designs remain unsupported;
this deployment repairs transport only
```

---

## 4. Requirements ↔ source mapping

| V1 requirement | Original source / system | Current state |
|----------------|--------------------------|---------------|
| Book + Tree opening, spoken Tree, no typing | Approved scene assets; Tree voice surface; engage flow | Item 1 owner-approved. Items 2+ open. |
| Engines analyze objective (no external AI) | engine_mesh, ME, DTF, Confidence, Contradiction, Knowledgeverse, Galaxy Bridge, objective_runtime | Residual OpenAI paths neutralized in web layer on this branch. Capability gate blocks non-document execution. |
| Exactly four pathways including BLEND | DTF PathwayPlanner, developmental_pipeline; web delivery model treats BLEND as first-class | Must use original definitions; no external assignment of pathway content. |
| ENTER PATHWAY → unique design + Tree voice | RealityViewer; construction design specification | Blocked for physical-class objectives by capability registry. |
| Blueprint / Dissect / Explode-Implode / grab-rotate-zoom / side component list | RealityViewer modes + CSS parts; construction engine structures | UI present; live unique designs require real engine output. |
| BUILD ON RESULT | Web iteration/blend/parent-context models; core governed state + Knowledgeverse lineage | Requires retained run context and memory connection. |
| Memory + Knowledgeverse | knowledgeverse_runtime, Galaxy Bridge, governed_closure, publication, Library Cards | Must connect to original systems; no session-only imitation. |
| Tree persistent spoken guide | Tree voice surface + guide personality | Must remain present across selection and inspection. |
| Proposed ≠ Simulated ≠ Executed ≠ Verified | Governed closure, AutoSync, publication contracts, evidence receipts | Must be preserved; no false verification claims. |

---

## 5. Governed objective path (as implemented in recovered source)

```text
Objective text
  → Meaning Elements + Destiny
  → engine_mesh (read/analysis only)
  → DTF / PathwayPlanner (branches, confidence, risk, Guardian)
  → select_capability (capabilities.py)
       ├─ document contracts → digital_artifact_writer / document_bundle
       └─ non-document contracts → "unavailable:<contract>"
  → objective_runtime
       ├─ capability in REGISTRY → governed cycle + evidence
       └─ not in REGISTRY → BLOCKED_CAPABILITY_UNAVAILABLE
```

Construction path that exists but is disconnected:

```text
clarity/autosync/construction_engine.py
  → UniversalConstructionEngine
  → AutoSyncToolRegistry (tools for physical_design / generative_3d_form / software_design)
  → TwinLattice + Guardian + evidence
```

---

## 6. Residual external-AI surfaces (web layer) — neutralized on this branch

| Location | Change on this branch |
|----------|----------------------|
| `openai.server.ts` | Architecture-disabled banner |
| `delivery.server.ts` | OpenAI research call removed; hasOpenAI=false |
| `approved-answer.server.ts` | enabled() hard-returns false |
| `image.server.ts` | OpenAI provider selection disabled |
| `engage.tsx` | OpenAI product label removed |

---

## 7. Owner approval checklist (unchanged)

```text
1. [x] Original Tree and Book together. (Owner approved)
2. [ ] No typing. Talk to the Tree.
3. [ ] Exactly four pathways including BLEND.
4. [ ] ASCENSION's own engines create their own answers independently.
5. [ ] Selected pathway opens its own design picture; Tree explains by voice.
6. [ ] Grab, rotate, and zoom.
7. [ ] Blueprint with real dimensions and measurements.
8. [ ] Dissect, Exploded, and Imploded views.
9. [ ] Component descriptions in a side list; Tree explains parts.
10. [ ] BUILD ON RESULT continues without starting over.
11. [ ] "It supposed to have memory too."
```

Nothing beyond item 1 is marked complete.

---

## 8. Controlled repair principles

1. Recover and wire original engines; do not invent replacements.
2. Register existing capabilities (e.g. UniversalConstructionEngine under a proper contract) only with evidence and Guardian rules already present in that code.
3. Neutralize external AI so it cannot produce pathway answers.
4. Preserve approved Book + Tree + RealityViewer inspection surface.
5. Maintain proposed / simulated / executed / verified distinctions.
6. Owner must see behavior and approve each checklist item.
7. Everything remains connected; evolution remains key.

---

## 9. Immediate work on this branch

- Architecture + requirements map (this document).
- Neutralization of residual OpenAI / external-AI call paths in the web layer.
- Capability-wiring analysis for UniversalConstructionEngine prepared for owner-authorized private-core application; no silent private-image rewrite from this public branch.

End of recovery map.
