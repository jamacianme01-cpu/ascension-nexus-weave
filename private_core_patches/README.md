# Private core patch — physical_design capability

## Status (verified from GitHub API)

- Chunks: `ASCENSION_CORE/hx.00` … `hx.33` (34 files)
- Assembled unified patch: 6718 bytes
- Applies cleanly to recovered original `capabilities.py`
- Result length 14939 bytes
- SHA256 of result: `e513813f5f595ad6e6a22efce9a1c9bdd7a7ab0d74379e8035988fe2e0c18b4e`
- `select_capability("make worker drones for people with dementia", [])` → `physical_design`

## Apply

```bash
bash private_core_patches/APPLY.sh /path/to/clarity
# restart ASCENSION worker / Fly engine
```

APPLY refuses incomplete chunk sets and refuses results missing `PhysicalDesignCapability`.

## What it does

Registers existing `UniversalConstructionEngine` under capability id `physical_design`.
Does not rewrite `construction_engine.py`.
Preserves original document writers.

## Do not claim

V1 complete, checklist items 2–11, or live ENGAGE proof until after apply + restart + observed run.
