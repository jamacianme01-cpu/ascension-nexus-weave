#!/usr/bin/env python3
"""Apply the original owner's physical-generation repair only to matching core files.

Preserve the user's exact spoken objective through the existing DTF branches;
do not submit branch labels (single_pass_construct etc.) to the 3D engine.
Abort on any source mismatch, without altering governed runtime state.
"""
import ast
import re
import sys
from pathlib import Path

HUNK = re.compile(r'^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@')

def patched(source: str, diff: str) -> str:
    lines = source.splitlines(keepends=True)
    patch_lines = diff.splitlines(keepends=True)
    if len(patch_lines) < 4 or patch_lines[0].strip() != '--- a/ASCENSION_CORE/capabilities.py' or patch_lines[1].strip() != '+++ b/ASCENSION_CORE/capabilities.py':
        raise ValueError('Refusing a patch for any file except original capabilities.py')
    hunks = []
    i = 2
    while i < len(patch_lines):
        m = HUNK.match(patch_lines[i])
        if not m:
            raise ValueError('Malformed capability patch header')
        i += 1
        old, new = [], []
        while i < len(patch_lines) and not patch_lines[i].startswith('@@ '):
            line = patch_lines[i]
            i += 1
            if line.startswith('\\ No newline at end of file'):
                raise ValueError('Refusing patch with missing newline')
            if line[:1] not in (' ', '+', '-'):
                raise ValueError('Unexpected capability patch operation')
            if line[0] in (' ', '-'):
                old.append(line[1:])
            if line[0] in (' ', '+'):
                new.append(line[1:])
        old_count, new_count = int(m.group(2) or '1'), int(m.group(4) or '1')
        if len(old) != old_count or len(new) != new_count:
            raise ValueError('Capability patch hunk line count mismatch')
        hunks.append((old, new))
    if len(hunks) != 2:
        raise ValueError('Expected exactly two original capability registry edits')
    cursor = 0
    for old, new in hunks:
        matches = [pos for pos in range(cursor, len(lines) - len(old) + 1) if lines[pos:pos+len(old)] == old]
        if len(matches) != 1:
            raise ValueError('Original capability source differs from approved baseline')
        pos = matches[0]
        lines[pos:pos+len(old)] = new
        cursor = pos + len(new)
    result = ''.join(lines)
    ast.parse(result, filename='ASCENSION_CORE/capabilities.py')
    if result.count('class PhysicalDesignCapability:') != 1 or 'PhysicalDesignCapability.contract.capability_id: PhysicalDesignCapability()' not in result:
        raise ValueError('Capability adapter registry invariants missing')
    return result

def preserve_original_objective(schema: str, pipeline: str, capabilities: str):
    """Carry original Destiny untouched through Branch, planner, and writer."""
    needle_schema = "    evaluation: Dict[str, Any] = field(default_factory=dict)\\n\\n    def to_dict(self) -> Dict:\\n"
    replaced_schema = (
        "    evaluation: Dict[str, Any] = field(default_factory=dict)\\n"
        "    # Exact owner objective is not the branch plan label.\\n"
        '    original_objective: str = ""\\n\\n'
        "    def to_dict(self) -> Dict:\\n"
    )
    needle_pipeline = "    branches = [replace(b, capability=delegated) for b in branches]\\n"
    replaced_pipeline = (
        "    branches = [replace(b, capability=delegated, "
        "original_objective=destiny) for b in branches]\\n"
    )
    if schema.count(needle_schema) != 1 or pipeline.count(needle_pipeline) != 1:
        raise ValueError("Original Destiny/DTF source differs; refusing to invent a replacement")
    if 'getattr(branch, "original_objective"' not in capabilities:
        raise ValueError("Physical generation must use original_objective, not branch.approach")
    schema = schema.replace(needle_schema, replaced_schema)
    pipeline = pipeline.replace(needle_pipeline, replaced_pipeline)
    ast.parse(schema, filename="ASCENSION_CORE/schemas.py")
    ast.parse(pipeline, filename="ASCENSION_CORE/pipeline.py")
    ast.parse(capabilities, filename="ASCENSION_CORE/capabilities.py")
    return schema, pipeline, capabilities


def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '/app')
    cap_file = root / "ASCENSION_CORE/capabilities.py"
    schema_file = root / "ASCENSION_CORE/schemas.py"
    pipeline_file = root / "ASCENSION_CORE/pipeline.py"
    diff = root / "original-physical-capability.patch"
    cap_new = patched(cap_file.read_text(encoding="utf-8"), diff.read_text(encoding="utf-8"))
    schema_new, pipeline_new, cap_new = preserve_original_objective(
        schema_file.read_text(encoding="utf-8"),
        pipeline_file.read_text(encoding="utf-8"), cap_new,
    )
    # Every file and structural invariant is validated before the first write.
    originals = {p: p.read_text(encoding="utf-8")
                 for p in (cap_file, schema_file, pipeline_file)}
    try:
        for target, contents in ((schema_file, schema_new),
                                 (pipeline_file, pipeline_new),
                                 (cap_file, cap_new)):
            target.write_text(contents, encoding="utf-8")
    except Exception:
        for target, original in originals.items():
            target.write_text(original, encoding="utf-8")
        raise
    print("ASCENSION_ORIGINAL_DESTINY_PRESERVED_AND_REAL_3D_ADAPTER_REGISTERED")

if __name__ == '__main__':
    main()
