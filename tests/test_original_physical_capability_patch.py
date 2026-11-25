#!/usr/bin/env python3
"""Offline fail-closed tests for the ORIGINAL private capability adapter."""
import ast
import importlib.util
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/ascension-owner-queue/apply-original-physical-capability.py"
PATCH = ROOT / "scripts/ascension-owner-queue/original-physical-capability.patch"

spec = importlib.util.spec_from_file_location("original_capability_patch", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def old_hunks():
    lines = PATCH.read_text(encoding="utf-8").splitlines(keepends=True)
    hunks = []
    i = 2
    while i < len(lines):
        match = mod.HUNK.match(lines[i])
        assert match, "Bad hunk header"
        i += 1
        old, new = [], []
        while i < len(lines) and not lines[i].startswith("@@ "):
            line = lines[i]
            i += 1
            if line.startswith(" ") or line.startswith("-"):
                old.append(line[1:])
            if line.startswith(" ") or line.startswith("+"):
                new.append(line[1:])
        assert len(old) == int(match.group(2))
        assert len(new) == int(match.group(4))
        hunks.append((old, new))
    return hunks

def synthetic_original():
    first, second = old_hunks()
    prefix = (
        "from __future__ import annotations\n"
        "from typing import Dict, List\n"
        "import json\n"
        "class CapabilityContract:\n"
        "    def __init__(self, **kwargs): self.__dict__.update(kwargs)\n"
        "class DigitalArtifactWriter:\n"
        "    contract = type('C', (), {'capability_id':'digital_artifact_writer'})()\n"
        "class DocumentBundleCapability:\n"
        "    contract = type('C', (), {'capability_id':'document_bundle'})()\n"
        "class CapabilityResult: pass\n"
        "class Branch: pass\n"
        "class MeaningElement: pass\n"
        "DOCUMENT_OUTPUTS = {'answer', 'document_bundle'}\n"
        "def requested_output_contract(destiny, requested_type):\n"
        "    return 'physical_design' if 'drone' in destiny.lower() else 'answer'\n"
        "def earlier_writer():\n"
        "    return (\n"
    )
    before_select = (
        "def select_capability(destiny: str, mes: List[MeaningElement], requested_type: str = '') -> str:\n"
        '    """Select only capabilities whose output matches the requested contract."""\n'
    )
    source = prefix + "".join(first[0]) + before_select + "".join(second[0]) + (
        '        return "document_bundle"\n'
        '    return "digital_artifact_writer"\n'
    )
    ast.parse(source)
    return source

class OriginalEngineAdapterTests(unittest.TestCase):
    def test_reviewed_diff_is_structurally_valid(self):
        self.assertEqual(len(old_hunks()), 2)

    def test_exact_original_receives_only_adapter_and_registry(self):
        old = synthetic_original()
        result = mod.patched(old, PATCH.read_text(encoding="utf-8"))
        ast.parse(result)
        self.assertIn("class PhysicalDesignCapability:", result)
        self.assertIn("PhysicalDesignCapability.contract.capability_id: PhysicalDesignCapability()", result)
        self.assertIn('return "unavailable:physical_design"', result)
        self.assertEqual(result.count("class PhysicalDesignCapability:"), 1)
        self.assertIn("class DigitalArtifactWriter:", result)
        self.assertIn("class DocumentBundleCapability:", result)

    def test_physical_design_never_uses_placeholder_geometry(self):
        original = synthetic_original()
        patched = mod.patched(original, PATCH.read_text(encoding="utf-8"))
        physical = patched.split("class PhysicalDesignCapability:", 1)[1].split("REGISTRY:", 1)[0]
        self.assertIn('artifact_type="generative_3d_form"', physical)
        self.assertNotIn('artifact_type="physical_design"', physical)
        self.assertIn('job.build_state != "candidate_validated"', physical)
        self.assertIn('model.suffix.lower() != ".glb"', physical)
        self.assertIn('metadata.get("mesh_sha256") != digest', physical)
        self.assertIn('metadata.get("dimensionally_authoritative") is not False', physical)
        self.assertNotIn('files["construction_job.json"]', physical)
        self.assertNotIn('job.build_state = "verified"', physical)

    def test_unapproved_reference_blocks_without_a_model_engine(self):
        import os
        from unittest.mock import patch
        from types import SimpleNamespace
        source = mod.patched(synthetic_original(), PATCH.read_text(encoding="utf-8"))
        node = next(item for item in ast.parse(source).body
                    if isinstance(item, ast.ClassDef) and
                    item.name == "PhysicalDesignCapability")
        ns = {
            "CapabilityContract": lambda **kwargs: SimpleNamespace(**kwargs),
            "CapabilityResult": lambda **kwargs: SimpleNamespace(**kwargs),
            "Branch": object,
            "MeaningElement": object,
            "List": list,
            "Dict": dict,
        }
        exec(compile(ast.Module(body=[node], type_ignores=[]),
                     "ASCENSION_CORE/capabilities.py", "exec"), ns)
        writer = ns["PhysicalDesignCapability"]()
        branch = SimpleNamespace(approach="Make worker drones for people with dementia",
                                 expected=SimpleNamespace(artifact_name="drone.md"))
        elements = [SimpleNamespace(text="dementia guidance and environmental awareness")]
        with patch.dict(os.environ, {"ASCENSION_PHYSICAL_REFERENCE_IMAGE": ""}):
            with self.assertRaisesRegex(RuntimeError, "REAL_PHYSICAL_GENERATION_BLOCKED"):
                writer.write(branch, elements)

    def test_modified_original_source_is_rejected(self):
        old = synthetic_original().replace("DocumentBundleCapability()", "MissingOwnerCapability()")
        with self.assertRaises(ValueError):
            mod.patched(old, PATCH.read_text(encoding="utf-8"))

    def test_unrelated_diff_target_is_rejected(self):
        old = synthetic_original()
        diff = PATCH.read_text(encoding="utf-8").replace(
            "--- a/ASCENSION_CORE/capabilities.py",
            "--- a/ASCENSION_CORE/guardian.py",
        )
        with self.assertRaises(ValueError):
            mod.patched(old, diff)

if __name__ == "__main__":
    unittest.main()
