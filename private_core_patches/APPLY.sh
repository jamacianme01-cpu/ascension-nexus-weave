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
elif [[ -f "$CORE/capabilities.py.b64" ]]; then
  SRC="$CORE/capabilities.py.assembled"
  base64 -d < "$CORE/capabilities.py.b64" > "$SRC" 2>/dev/null || base64 --decode < "$CORE/capabilities.py.b64" > "$SRC"
elif [[ -f "$CORE/capabilities.py.b64.part1" ]]; then
  SRC="$CORE/capabilities.py.assembled"
  cat "$CORE/capabilities.py.b64.part1" "$CORE/capabilities.py.b64.part2" | base64 -d > "$SRC" 2>/dev/null || \
    cat "$CORE/capabilities.py.b64.part1" "$CORE/capabilities.py.b64.part2" | base64 --decode > "$SRC"
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
