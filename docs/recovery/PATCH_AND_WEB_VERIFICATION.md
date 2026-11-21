# Patch and web-layer verification (2026-11-19)

## Status

Complete local files verified. Published to branch only when this document and the full `capabilities.py` are present together.

## Private-core patch

| Check | Result |
|-------|--------|
| File | `private_core_patches/ASCENSION_CORE/capabilities.py` (complete, 14939 bytes) |
| SHA256 | e513813f5f595ad6e6a22efce9a1c9bdd7a7ab0d74379e8035988fe2e0c18b4e |
| Syntax | `ast.parse` OK |
| Preserves DigitalArtifactWriter | yes |
| Preserves DocumentBundleCapability | yes |
| Adds PhysicalDesignCapability | yes |
| Registers in REGISTRY | yes |
| Calls existing UniversalConstructionEngine only | yes (`create_job` / `run_job`) |
| Does not rewrite construction_engine.py | yes |

### select_capability offline tests (10/10)

| Objective | requested_output_contract | select_capability |
|-----------|---------------------------|-------------------|
| make worker drones for people with dementia | physical_design | physical_design |
| how do you multiply | answer | digital_artifact_writer |
| make a music app | software_design | unavailable:software_design |

Software remains unavailable (no software capability in this recovery snapshot). That is intentional honesty, not a silent document fallback.

### APPLY.sh

Refuses to run unless the **complete** `capabilities.py` is present and contains `PhysicalDesignCapability` + registry registration. Partial part1/b64 fragments are rejected.

## Web-layer neutralization

| File | SHA256 | Check |
|------|--------|-------|
| delivery.server.ts | dd1238c7f6c9b840743b706ff8f3397d1358d5312988e55a992fe8d41e58305e | no callOpenAIResponse import/call; hasOpenAI=false; EXTERNAL AI DISABLED |
| image.server.ts | d1d57f32b31467c129852e3891246acd39a35e06e51864e6d59948794c4a298a | OpenAI provider selection disabled (`if (false && openaiKey`) |
| engage.tsx | 7d5f0a15debea951dcdfec9ff4ec8fb7624cd30080fd06412a93c8d2b755d337 | label is EXTERNAL RESEARCH SOURCES (UNVERIFIED), not RESEARCH SOURCES · OPENAI |
| approved-answer.server.ts | (published earlier) | enabled() returns false |
| openai.server.ts | (published earlier) | callOpenAIResponse throws disabled error |

## Not claimed

- Live private engine image not modified by this document
- Fly governed state not modified
- V1 checklist items 2–11 still open
- Live ENGAGE proof still required after applying complete patch to private core and restarting worker
