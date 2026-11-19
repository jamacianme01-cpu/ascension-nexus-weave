#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-}"
if [[ -z "$ROOT" ]]; then
  echo "Usage: $0 /path/to/clarity-or-core-root" >&2
  exit 2
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE="$SCRIPT_DIR/ASCENSION_CORE"
if [[ -f "$CORE/capabilities.py" ]]; then
  SRC="$CORE/capabilities.py"
elif [[ -f "$CORE/capabilities.complete.part1.txt" && -f "$CORE/capabilities.complete.part2.txt" && -f "$CORE/capabilities.complete.part3.txt" ]]; then
  SRC="$CORE/capabilities.py.assembled"
  cat "$CORE/capabilities.complete.part1.txt" "$CORE/capabilities.complete.part2.txt" "$CORE/capabilities.complete.part3.txt" > "$SRC"
elif [[ -f "$CORE/capabilities.py.b64" ]]; then
  SRC="$CORE/capabilities.py.assembled"
  base64 -d < "$CORE/capabilities.py.b64" > "$SRC" 2>/dev/null || base64 --decode "$CORE/capabilities.py.b64" > "$SRC"
else
  echo "REFUSING: complete capabilities.py missing" >&2
  exit 1
fi
if ! grep -q 'class PhysicalDesignCapability' "$SRC"; then
  echo "REFUSING: assembled file missing PhysicalDesignCapability" >&2
  exit 1
fi
if ! grep -q 'PhysicalDesignCapability()' "$SRC"; then
  echo "REFUSING: assembled file missing REGISTRY registration" >&2
  exit 1
fi
if [[ -d "$ROOT/ASCENSION_CORE" ]]; then
  TARGET="$ROOT/ASCENSION_CORE/capabilities.py"
elif [[ -f "$ROOT/capabilities.py" ]]; then
  TARGET="$ROOT/capabilities.py"
else
  echo "ASCENSION_CORE not found under $ROOT" >&2
  exit 1
fi
cp -a "$TARGET" "${TARGET}.bak.$(date +%Y%m%d%H%M%S)"
cp "$SRC" "$TARGET"
echo "Applied COMPLETE physical_design capability registration to $TARGET"
echo "Restart the ASCENSION worker / Fly engine process to load the registry."
