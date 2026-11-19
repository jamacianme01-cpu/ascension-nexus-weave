#!/usr/bin/env bash
# Apply private-core physical_design capability registration to a local ASCENSION core tree.
# Usage: ./private_core_patches/APPLY.sh /path/to/clarity
set -euo pipefail
ROOT="${1:-}"
if [[ -z "$ROOT" ]]; then
  echo "Usage: $0 /path/to/clarity-or-core-root" >&2
  exit 2
fi
TARGET="$ROOT/ASCENSION_CORE/capabilities.py"
if [[ ! -d "$ROOT/ASCENSION_CORE" ]]; then
  # allow passing the ASCENSION_CORE directory itself
  if [[ -f "$ROOT/capabilities.py" && -d "$ROOT" ]]; then
    TARGET="$ROOT/capabilities.py"
  else
    echo "ASCENSION_CORE not found under $ROOT" >&2
    exit 1
  fi
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/ASCENSION_CORE/capabilities.py"
if [[ ! -f "$SRC" ]]; then
  echo "Patch source missing: $SRC" >&2
  exit 1
fi
cp -a "$TARGET" "${TARGET}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
cp "$SRC" "$TARGET"
echo "Applied physical_design capability registration to $TARGET"
echo "Restart the ASCENSION worker / Fly engine process to load the registry."
