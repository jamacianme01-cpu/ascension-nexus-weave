#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-}"
if [[ -z "$ROOT" ]]; then
  echo "Usage: $0 /path/to/clarity-or-core-root" >&2
  exit 2
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE="$SCRIPT_DIR/ASCENSION_CORE"
if [[ -d "$ROOT/ASCENSION_CORE" ]]; then
  TARGET="$ROOT/ASCENSION_CORE/capabilities.py"
elif [[ -f "$ROOT/capabilities.py" ]]; then
  TARGET="$ROOT/capabilities.py"
else
  echo "ASCENSION_CORE not found under $ROOT" >&2
  exit 1
fi
cp -a "$TARGET" "${TARGET}.bak.$(date +%Y%m%d%H%M%S)"
if [[ -f "$CORE/capabilities.py" ]] && grep -q 'class PhysicalDesignCapability' "$CORE/capabilities.py"; then
  cp "$CORE/capabilities.py" "$TARGET"
elif [[ -f "$CORE/capabilities.py.unified.patch" ]]; then
  (cd "$(dirname "$TARGET")/.." && patch -p1 < "$CORE/capabilities.py.unified.patch") || \
    (cd "$(dirname "$TARGET")" && patch -p1 < "$CORE/capabilities.py.unified.patch")
else
  echo "REFUSING: no complete capabilities.py or unified.patch" >&2
  exit 1
fi
if ! grep -q 'class PhysicalDesignCapability' "$TARGET"; then
  echo "REFUSING: post-apply file missing PhysicalDesignCapability — restore from .bak" >&2
  exit 1
fi
if ! grep -q 'PhysicalDesignCapability()' "$TARGET"; then
  echo "REFUSING: post-apply REGISTRY missing PhysicalDesignCapability() — restore from .bak" >&2
  exit 1
fi
echo "Applied physical_design capability registration to $TARGET"
echo "Restart the ASCENSION worker / Fly engine process to load the registry."
