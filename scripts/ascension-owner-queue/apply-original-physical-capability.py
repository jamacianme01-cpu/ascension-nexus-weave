#!/usr/bin/env python3
"""Strictly register the owner-authored construction engine in a private Fly image.

Apply the reviewed unified diff only against matching original ASCENSION_CORE.
Abort if source differs, before writing. Never touch the mounted governed volume.
"""
import ast
import re
import sys
from pathlib import Path

HUNK = re.compile(r'^@@ -(\\d+)(?:,(\\d+))? \\+(\\d+)(?:,(\\d+))? @@')

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

def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '/app')
    target = root / 'ASCENSION_CORE/capabilities.py'
    diff = root / 'original-physical-capability.patch'
    updated = patched(target.read_text(encoding='utf-8'), diff.read_text(encoding='utf-8'))
    target.write_text(updated, encoding='utf-8')
    print('ASCENSION_ORIGINAL_PHYSICAL_DESIGN_CAPABILITY_REGISTERED_IN_PRIVATE_IMAGE')

if __name__ == '__main__':
    main()
