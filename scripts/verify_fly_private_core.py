#!/usr/bin/env python3
"""Fail closed unless the *owner's private, current* ASCENSION runtime is supplied.

This script never downloads source and never republishes proprietary modules.
It checks only the private Fly build-context mount staged by the deploy workflow.
"""
from __future__ import annotations

import ast
import pathlib
import sys

REQUIRED = (
    "ASCENSION_CORE/__init__.py",
    "ASCENSION_CORE/cloud_queue_worker.py",
    "ASCENSION_CORE/objective_intake.py",
    "ASCENSION_CORE/objective_runtime.py",
    "ASCENSION_CORE/live_runtime.py",
    "ASCENSION_CORE/engine_mesh.py",
    "ASCENSION_CORE/governed_closure.py",
    "ASCENSION_CORE/knowledgeverse_runtime.py",
    "ASCENSION_CORE/publication_contract.py",
    "clarity/__init__.py",
    "clarity/core_runtime.py",
    "clarity/contradiction_engine.py",
    "clarity/alchemy_layer.py",
    "clarity/hypothesis_engine.py",
    "clarity/identity_finder.py",
    "clarity/emergence_engine.py",
)


def verify(root: pathlib.Path) -> list[str]:
    if not root.is_dir():
        return [f"Private runtime directory does not exist: {root}"]
    failures: list[str] = []
    for relative in REQUIRED:
        path = root / relative
        if not path.is_file():
            failures.append(f"Missing owner's engine source: {relative}")
            continue
        try:
            ast.parse(path.read_text(encoding="utf-8-sig"), filename=relative)
        except (OSError, SyntaxError, UnicodeError) as exc:
            failures.append(f"Invalid engine source {relative}: {exc}")
    return failures


if __name__ == "__main__":
    path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".private_runtime")
    errors = verify(path)
    if errors:
        print("ASCENSION private Fly engine deployment BLOCKED:", file=sys.stderr)
        for message in errors:
            print(f"  - {message}", file=sys.stderr)
        raise SystemExit(2)
    print("ASCENSION private engine source verified for packaging (not runtime execution).")
