# Private core patches — ASCENSION recovery

These files are the exact private-core changes derived from the owner engine recovery archive.

## capabilities.py

Registers the **existing** `UniversalConstructionEngine` under capability id `physical_design`.

Effect on `select_capability`:

- Before: physical design objectives → `unavailable:physical_design` → `BLOCKED_CAPABILITY_UNAVAILABLE`
- After: physical design objectives → `physical_design` when the capability is available

`clarity/autosync/construction_engine.py` is **not** rewritten. The adapter only calls `create_job` / `run_job`.

## Apply to private engine image / Windows core

Copy:

```text
private_core_patches/ASCENSION_CORE/capabilities.py
→ ASCENSION_CORE/capabilities.py
```

on the owner private source / Fly engine image build context, then restart the worker.

Do not apply this as a public substitute for ASCENSION_CORE. It must land in the real private runtime that already contains `clarity.autosync.construction_engine`.

## Honesty

- Design/simulation artifacts only unless fabrication backends are present and verified
- No checklist items marked complete by this patch alone
- Live ENGAGE proof still required after apply
