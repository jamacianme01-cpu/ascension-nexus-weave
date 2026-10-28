"""Controlled first-software objective preflight for ASCENSION's Windows core.

This *does not* claim cloud queue items, change governed state, bypass Guardian
or assert that browser interactions are verified. It uses the installed real
software executor to generate an actual HTML app and checks the source files.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys


def run(root: Path, objective: str = "make a music app") -> Path:
    root = root.resolve()
    if not (root / "ASCENSION_CORE" / "capabilities.py").is_file():
        raise RuntimeError("ASCENSION core not found at " + str(root))
    sys.path.insert(0, str(root))
    from ASCENSION_CORE.capabilities import REGISTRY, select_capability
    from ASCENSION_CORE.software_project_executor import (
        preflight, create_software_artifacts,
    )

    ready, diagnostic = preflight()
    if not ready:
        raise RuntimeError("Software executor not ready: " + diagnostic)
    route = select_capability(objective, [])
    if route != "software_project" or route not in REGISTRY:
        raise RuntimeError("Governed software capability was not registered: " + str(route))

    # Generate and verify the real artifact *before* writing any output.
    files = create_software_artifacts(objective, "BR:software-app:preflight")
    if "index.html" not in files or "verification.json" not in files:
        raise RuntimeError("Software executor did not produce runnable source plus evidence")
    receipt = json.loads(files["verification.json"])
    if receipt.get("functional_browser_tested") is not False:
        raise RuntimeError("Verification scope was overstated")
    for name, value in files.items():
        if not isinstance(value, str) or not value:
            raise RuntimeError("Generated software artifact was empty: " + name)

    base = root / "generated_artifacts" / "software_preflight"
    folder = base / datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    folder.mkdir(parents=True, exist_ok=False)
    for name, value in files.items():
        if name not in {"index.html", "README.md", "verification.json"}:
            raise RuntimeError("Unexpected generated output path")
        (folder / name).write_text(value, encoding="utf-8", newline="\n")
        if hashlib.sha256((folder / name).read_bytes()).hexdigest() != hashlib.sha256(value.encode("utf-8")).hexdigest():
            raise RuntimeError("Written file could not be read back identically")
    print("LOCAL APP SOURCE CREATED:", folder / "index.html", flush=True)
    print("SOURCE CHECKS PASSED: offline HTML + Node JavaScript syntax", flush=True)
    print("BROWSER FEATURE VERIFICATION: NOT YET TESTED", flush=True)
    return folder


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    args = parser.parse_args()
    try:
        run(args.root)
    except Exception as exc:
        print("ENGAGE PREFLIGHT BLOCKED:", str(exc), file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
