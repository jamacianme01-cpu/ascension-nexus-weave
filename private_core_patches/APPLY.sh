#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-}"
if [[ -z "$ROOT" ]]; then
  echo "Usage: $0 /path/to/clarity-or-core-root" >&2
  exit 2
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/ASCENSION_CORE/capabilities.py" ]]; then
  SRC="$SCRIPT_DIR/ASCENSION_CORE/capabilities.py"
elif [[ -f "$SCRIPT_DIR/ASCENSION_CORE/capabilities.part1.py.txt" ]]; then
  SRC="$SCRIPT_DIR/ASCENSION_CORE/capabilities.py.assembled"
  cat "$SCRIPT_DIR/ASCENSION_CORE/capabilities.part1.py.txt" \
      "$SCRIPT_DIR/ASCENSION_CORE/capabilities.part2.py.txt" > "$SRC"
else
  echo "Patch source missing" >&2
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
cp -a "$TARGET" "${TARGET}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
cp "$SRC" "$TARGET"
echo "Applied physical_design capability registration to $TARGET"
echo "Restart the ASCENSION worker / Fly engine process to load the registry."
