# PROPOSED — Physical Design Capability Registration

**Status:** Proposal for owner authorization only.  
**Not applied** to private Fly image or live `ASCENSION_CORE`.  
**Source basis:** Recovered `capabilities.py` + `clarity/autosync/construction_engine.py` (2026-11-18 export).

## Goal

Register the *existing* `UniversalConstructionEngine` under a formal capability contract so `select_capability` can return a real capability for `physical_design` instead of `"unavailable:physical_design"`.

## Current blocking code (recovered capabilities.py)

```python
REGISTRY: Dict[str, object] = {
    DigitalArtifactWriter.contract.capability_id: DigitalArtifactWriter(),
    DocumentBundleCapability.contract.capability_id: DocumentBundleCapability(),
}

def select_capability(destiny: str, mes: List[MeaningElement], requested_type: str = "") -> str:
    contract = requested_output_contract(destiny, requested_type)
    if contract not in DOCUMENT_OUTPUTS:
        return "unavailable:" + contract
    if contract == "document_bundle":
        return "document_bundle"
    return "digital_artifact_writer"
```

## Proposed adapter shape (does not invent a new engine)

Add a capability class that:

1. Declares `CapabilityContract` with:
   - `capability_id = "physical_design"` (or `"universal_construction"`)
   - `output_contract = "physical_design"`
   - `accepted_intent_tokens` covering make/build/construct/design for hardware/drone/machine/robot/device
   - `evidence_produced` and `verification_method` aligned with ConstructionJob evidence already written by UniversalConstructionEngine
   - `available` set honestly from runtime probe (False if construction backends missing)
2. Implements a `.write(branch, mes) -> CapabilityResult` (same interface as document writers) that:
   - Builds a ConstructionJob via `UniversalConstructionEngine.create_job(...)`
   - Runs `run_job` / twin lattice as the existing class already does
   - Maps resulting design specification, layers, and evidence files into `CapabilityResult.files`
   - Does **not** claim physical manufacture when only design/simulation artifacts exist
3. Registers the instance in `REGISTRY`
4. Updates `select_capability` so that when `contract == "physical_design"` and the capability is available, it returns that capability id instead of `"unavailable:physical_design"`

## Exact integration points in recovered source

| Step | Module | Action |
|------|--------|--------|
| Contract + adapter class | `ASCENSION_CORE/capabilities.py` | Add class; import UniversalConstructionEngine |
| Registry entry | `ASCENSION_CORE/capabilities.py` REGISTRY | Add one entry |
| select_capability | `ASCENSION_CORE/capabilities.py` | Branch for physical_design when available |
| Engine implementation | `clarity/autosync/construction_engine.py` | **Unchanged** — call existing methods only |
| objective_runtime | uses REGISTRY | No change if capability_id is registered |

## Honesty rules (must remain)

- `available=False` when Fly/private image cannot run construction tools
- Never promote design/simulation output to "manufactured" or "verified physical execution"
- Preserve proposed / simulated / executed / verified distinctions
- Software objectives are a separate contract; do not fold them into physical_design unless a real software capability exists and is registered

## Authorization required

This proposal must not be applied to the live private engine image or governed state until the owner explicitly authorizes it.

After authorization and application:

1. Re-deploy / restart worker with the registered capability
2. ENGAGE a construction objective (e.g. worker drones)
3. Confirm status is not `BLOCKED_CAPABILITY_UNAVAILABLE`
4. Confirm four pathways including BLEND from ASCENSION engines
5. Owner approval against checklist items only after observed behavior

## What is NOT included

- No rewrite of UniversalConstructionEngine internals
- No external AI pathway generators
- No public fake ASCENSION_CORE
- No checklist items marked complete
