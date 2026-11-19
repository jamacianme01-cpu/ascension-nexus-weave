#!/usr/bin/env bash
# Apply COMPLETE physical_design capability registration to a local ASCENSION core tree.
# Refuses to run unless the full capabilities.py is present.
set -euo pipefail
ROOT="${1:-}"
if [[ -z "$ROOT" ]]; then
  echo "Usage: $0 /path/to/clarity-or-core-root" >&2
  exit 2
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/ASCENSION_CORE/capabilities.py"
if [[ ! -f "$SRC" ]]; then
  echo "REFUSING: complete capabilities.py missing at $SRC" >&2
  echo "Do not apply partial part1/part2/b64 fragments." >&2
  exit 1
fi
# Require PhysicalDesignCapability marker so partial files cannot pass
if ! grep -q 'class PhysicalDesignCapability' "$SRC"; then
  echo "REFUSING: $SRC does not contain PhysicalDesignCapability" >&2
  exit 1
fi
if ! grep -q 'PhysicalDesignCapability()' "$SRC"; then
  echo "REFUSING: $SRC does not register PhysicalDesignCapability in REGISTRY" >&2
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
