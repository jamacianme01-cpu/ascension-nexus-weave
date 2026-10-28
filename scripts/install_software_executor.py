"""Fail-closed installer for ASCENSION's optional offline browser-app executor.

Does NOT alter state/live, published revision, Guardian, or AutoSync.
Only edits two preflight-matched core source files after making a backup.
The capability advertises unavailable until local Ollama+Node are working.
"""
from __future__ import annotations

import argparse
import ast
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sys


CAP_IMPORT = "from .schemas import Branch, MeaningElement, slugify\n"
CAP_REGISTRY = "    DocumentBundleCapability.contract.capability_id: DocumentBundleCapability(),\n"
CAP_ADVERTISE = """def advertise_all() -> List[Dict]:
    return [capability.contract.advertise() for capability in REGISTRY.values()]
"""
CAP_SELECT = """    contract = requested_output_contract(destiny, requested_type)
    if contract not in DOCUMENT_OUTPUTS:
"""
OBJ_WRITE = "    generated = capability.write(selected_branch, mes)\n"
OBJ_WORKBENCH = """        try:
            import hashlib as _hashlib
            from clarity.workbench import ClarityWorkbench
"""

CAP_CLASS = '''
class SoftwareProjectCapability:
    """Actual offline browser app source generator; not a CAD or mobile executor."""
    contract = CapabilityContract(
        capability_id="software_project",
        name="Offline Browser App Software Executor",
        description="Generates runnable offline HTML+JavaScript from the exact objective; checks JS syntax.",
        accepted_intent_tokens=["app", "website", "web", "browser", "code", "game"],
        output_contract="single-page offline browser software source",
        constraints=["no remote assets", "offline CSP", "no generated code execution"],
        evidence_produced="HTML file, JS syntax-check receipt and SHA256",
        verification_method="HTML structure + Node.js syntax + SHA256; browser behavior not verified",
        risk_class="medium",
    )

    def write(self, branch: Branch, mes: List[MeaningElement], *,
              objective_text: str) -> CapabilityResult:
        from .software_project_executor import create_software_artifacts
        files = create_software_artifacts(objective_text, branch.branch_id)
        return CapabilityResult(
            capability=self.contract.capability_id,
            files=files,
            primary_artifact="index.html",
        )


'''
CAP_NEW_ADVERTISE = '''def advertise_all() -> List[Dict]:
    results = [capability.contract.advertise() for capability in REGISTRY.values()]
    for item in results:
        if item["capability_id"] == "software_project":
            item["available"] = software_project_preflight()[0]
    return results
'''
CAP_NEW_SELECT = '''    contract = requested_output_contract(destiny, requested_type)
    if contract in {"software_design", "software", "app", "website", "code"}:
        enabled, _reason = software_project_preflight()
        if enabled and software_project_supported(destiny):
            return "software_project"
        return "unavailable:" + contract
    if contract not in DOCUMENT_OUTPUTS:
'''
OBJ_NEW_WRITE = '''    if selected_branch.capability == "software_project":
        generated = capability.write(selected_branch, mes, objective_text=objective_text)
    else:
        generated = capability.write(selected_branch, mes)
'''
OBJ_NEW_WORKBENCH = '''        # A generated browser app is not a document. Its source and syntax were
        # checked, but no real browser acceptance/deployment has been verified.
        # Preserve the true proof scope; do not promote this to result fulfillment.
        if selected_branch.capability == "software_project":
            receipt["produced_output_contract"] = "software_design"
            receipt["requested_result_produced"] = False
            receipt["verification_scope"] = (
                "offline HTML structure, local Node JavaScript syntax and file hashes; "
                "browser functionality and deployment remain unverified")
            return receipt
        try:
            import hashlib as _hashlib
            from clarity.workbench import ClarityWorkbench
'''


def replace_once(source: str, find: str, replacement: str, label: str) -> str:
    if source.count(find) != 1:
        raise RuntimeError(f"Core compatibility check failed for {label}; files untouched")
    return source.replace(find, replacement, 1)


def patched_sources(cap_source: str, obj_source: str) -> tuple[str, str]:
    # Windows checkouts may use CRLF. Match exact structural anchors on LF,
    # retaining an untouched byte-for-byte backup before any replacement.
    cap_source = cap_source.replace("\r\n", "\n")
    obj_source = obj_source.replace("\r\n", "\n")
    if "class SoftwareProjectCapability:" in cap_source or \
       'selected_branch.capability == "software_project"' in obj_source:
        raise RuntimeError("Software executor is already installed or partially installed; no overwrite")

    cap = replace_once(
        cap_source, CAP_IMPORT,
        CAP_IMPORT + 'from .software_project_executor import preflight as software_project_preflight, supports_browser_app as software_project_supported\n',
        "registry imports",
    )
    cap = replace_once(cap, "\nREGISTRY: Dict[str, object] = {",
                       "\n" + CAP_CLASS + "REGISTRY: Dict[str, object] = {", "registry class")
    cap = replace_once(
        cap, CAP_REGISTRY,
        CAP_REGISTRY + '    "software_project": SoftwareProjectCapability(),\n',
        "registry insertion",
    )
    cap = replace_once(cap, CAP_ADVERTISE, CAP_NEW_ADVERTISE, "dynamic availability")
    cap = replace_once(cap, CAP_SELECT, CAP_NEW_SELECT, "software routing")
    obj = replace_once(obj_source, OBJ_WRITE, OBJ_NEW_WRITE, "objective writing")
    obj = replace_once(obj, OBJ_WORKBENCH, OBJ_NEW_WORKBENCH, "verification scope")

    for name, content in (("capabilities.py", cap), ("objective_runtime.py", obj)):
        ast.parse(content, filename=name)
    return cap, obj


def install(root: Path, source_module: Path, *, dry_run: bool = False) -> dict:
    root = root.expanduser().resolve()
    core = root / "ASCENSION_CORE"
    cap_file = core / "capabilities.py"
    obj_file = core / "objective_runtime.py"
    module_target = core / "software_project_executor.py"
    for item in (cap_file, obj_file, source_module):
        if not item.is_file():
            raise RuntimeError(f"Required file is missing: {item}")
    existing = module_target.read_bytes() if module_target.exists() else None
    new_module = source_module.read_bytes()
    if existing is not None and existing != new_module:
        raise RuntimeError("Existing software_project_executor.py differs; refusing overwrite")
    ast.parse(new_module.decode("utf-8"), filename="software_project_executor.py")
    originals = {cap_file: cap_file.read_bytes(), obj_file: obj_file.read_bytes()}
    cap, obj = patched_sources(
        originals[cap_file].decode("utf-8-sig"),
        originals[obj_file].decode("utf-8-sig"),
    )
    updated = {
        cap_file: cap.encode("utf-8"),
        obj_file: obj.encode("utf-8"),
        module_target: new_module,
    }
    if dry_run:
        return {"status": "compatible", "changed": [p.name for p in updated],
                "publication_mutated": False, "mode": "dry_run"}

    backup_dir = root / ("_ascension_software_backup_" +
                          datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f"))
    backup_dir.mkdir(parents=False, exist_ok=False)
    for p, data in originals.items():
        (backup_dir / p.name).write_bytes(data)
    if existing is not None:
        (backup_dir / module_target.name).write_bytes(existing)
    changed: list[Path] = []
    try:
        for path, data in updated.items():
            temp = path.with_suffix(path.suffix + ".new")
            temp.write_bytes(data)
            os.replace(temp, path)
            changed.append(path)
    except Exception:
        for path in changed:
            if path in originals:
                path.write_bytes(originals[path])
            elif path == module_target and existing is None:
                path.unlink(missing_ok=True)
            elif path == module_target:
                path.write_bytes(existing)
        raise
    return {"status": "installed", "files_changed": [p.name for p in changed],
            "backup": str(backup_dir), "publication_mutated": False,
            "requires": "Node.js and local Ollama coding model for availability"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--module", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        result = install(args.root, args.module, dry_run=args.dry_run)
    except Exception as exc:
        print("BLOCKED (core unchanged): " + str(exc), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
