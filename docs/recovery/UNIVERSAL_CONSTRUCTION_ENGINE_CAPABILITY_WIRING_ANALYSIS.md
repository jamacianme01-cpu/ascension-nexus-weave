# UniversalConstructionEngine — Capability Wiring Analysis

**Date:** 2026-11-19  
**Source:** Recovered `clarity/autosync/construction_engine.py` + `ASCENSION_CORE/capabilities.py`  
**Status:** Analysis only. No private-core modification applied from this public branch without owner authorization.

---

## 1. What exists today

### capabilities.py (governed selection)

- REGISTRY: only `digital_artifact_writer`, `document_bundle`
- `requested_output_contract()` correctly classifies many production intents as `physical_design`, `software_design`, `cad`, `generative_3d_form`, etc.
- `select_capability()` returns `"unavailable:" + contract` for every non-document contract
- `objective_runtime` then emits `BLOCKED_CAPABILITY_UNAVAILABLE`

### UniversalConstructionEngine (disconnected)

Location: `clarity/autosync/construction_engine.py`

| Symbol | Role |
|--------|------|
| `ConstructionJob` | Job state: objective, MEs, artifact_type, layers, defects, evidence, provenance |
| `AutoSyncToolRegistry` | Selects tools by `artifact_type` |
| `AutoSyncGuardian` | Stage validation |
| `CodeImplementationTool` | artifact_types: software_design, physical_design |
| `UnrealTool` | physical_design, software_design |
| `VisualGenerationTool` | physical_design |
| `CadModelingTool` | physical_design |
| `SimulationTool` | physical_design |
| `SlicingTool` | physical_design |
| `ManufacturingExporterTool` | physical_design |
| `Hunyuan3DConstructionTool` | generative_3d_form |
| `UniversalConstructionEngine` | `create_job`, `run_job`, `run_twin_lattice`, design specification, layers, evidence |

The engine already produces design specifications, construction layers, twin-lattice branches, inspection results, and evidence structures. It is not a stub.

---

## 2. Why ENGAGE never reaches it

```text
ENGAGE objective
  → Meaning Elements / DTF planning
  → select_capability(destiny, mes)
  → contract = physical_design (for drones, machines, hardware, …)
  → contract ∉ DOCUMENT_OUTPUTS
  → return "unavailable:physical_design"
  → objective_runtime → BLOCKED_CAPABILITY_UNAVAILABLE
```

`UniversalConstructionEngine` is never consulted because it is not an entry in `capabilities.REGISTRY` and has no `CapabilityContract` that `select_capability` can return.

---

## 3. Wiring shape required (from existing patterns)

A capability entry in this architecture is expected to:

1. Expose a `CapabilityContract` with:
   - `capability_id`
   - `name`, `description`
   - `accepted_intent_tokens`
   - `output_contract` (e.g. `physical_design`)
   - `constraints`
   - `required_authority`
   - `evidence_produced`
   - `verification_method`
   - `risk_class`
   - `available: bool`
2. Implement a method (today’s document writers use `.write(branch, mes) → CapabilityResult`) that returns files + primary artifact.
3. Be registered in `REGISTRY` under its `capability_id`.
4. Be returned by `select_capability` when `requested_output_contract` matches.

For construction, the adapter must:

- Accept the planned branch + Meaning Elements (same inputs as document writers).
- Call into the **existing** `UniversalConstructionEngine.create_job` / `run_job` (or equivalent public method) without rewriting the engine.
- Map ConstructionJob outputs (design specification, layers, evidence, artifact paths) into the `CapabilityResult.files` / primary artifact shape the rest of the runtime already reads.
- Preserve Guardian / evidence rules already inside the construction module.
- Set `available` honestly (false if required tools or Unreal/CAD backends are not present in the deployment).

This is registration and adaptation of an existing engine, not invention of a new one.

---

## 4. Risk and honesty constraints

- Do not mark `available: true` if the deployment cannot actually run the construction tools (Fly image currently reports physical executor missing).
- Do not claim manufacture, physical fabrication, or verified real-world execution when only design/simulation artifacts were produced.
- Keep proposed / simulated / executed / verified distinctions.
- Software path: no `SoftwareProjectCapability` exists in this recovery snapshot; do not invent one under a construction contract.
- Private-core change (editing `capabilities.py` inside the owner engine image) requires owner authorization and must be applied against the live private source / image, not by shipping a public substitute that pretends to be ASCENSION_CORE.

---

## 5. Recommended sequence (owner-gated)

1. Confirm this analysis against the live private `ASCENSION_CORE` tree (archive may lag the running image).
2. Owner authorizes a capability adapter that wraps `UniversalConstructionEngine` under output contract `physical_design` (and related contracts the tools already declare).
3. Implement adapter + REGISTRY entry in the private source; keep evidence and Guardian behavior of the existing engine.
4. Advertise availability only when the deployment actually contains the required tool backends.
5. Re-run ENGAGE with a construction objective (e.g. worker drones) and show:
   - status is no longer `BLOCKED_CAPABILITY_UNAVAILABLE`
   - four pathways including BLEND from ASCENSION engines
   - selected pathway yields a design the RealityViewer can inspect
6. Owner approval against checklist items 3–9 (and memory item 11) only after observed behavior.

---

## 6. What this public branch does **not** do

- Does not rewrite private Fly engine image.
- Does not add a fake construction capability to the public web repo that claims to be ASCENSION_CORE.
- Does not invent pathway names or design content.
- Does not mark any checklist item complete.

End of analysis.
