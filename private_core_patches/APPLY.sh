#!/usr/bin/env bash
# Assemble hx.00-hx.33 into unified patch, apply to original capabilities.py
# Verified: assembled patch applies cleanly; result matches SHA256 e513813f5f595ad6e6a22efce9a1c9bdd7a7ab0d74379e8035988fe2e0c18b4e
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
  TOP="$ROOT"
elif [[ -f "$ROOT/capabilities.py" ]]; then
  TARGET="$ROOT/capabilities.py"
  TOP="$(dirname "$ROOT")"
else
  echo "ASCENSION_CORE not found under $ROOT" >&2
  exit 1
fi
# Prefer full file if present and complete
if [[ -f "$CORE/capabilities.py" ]] && grep -q 'class PhysicalDesignCapability' "$CORE/capabilities.py" && grep -q 'PhysicalDesignCapability()' "$CORE/capabilities.py"; then
  cp -a "$TARGET" "${TARGET}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$CORE/capabilities.py" "$TARGET"
  echo "Applied full capabilities.py to $TARGET"
  exit 0
fi
# Assemble hex chunks
missing=0
for i in $(seq -w 0 33); do
  f="$CORE/hx.$i"
  if [[ ! -f "$f" ]]; then echo "missing $f" >&2; missing=1; fi
done
if [[ "$missing" -ne 0 ]]; then
  echo "REFUSING: incomplete hx.00-hx.33 set" >&2
  exit 1
fi
HEX="$CORE/capabilities.unified.hex"
cat "$CORE"/hx.* > "$HEX"
PATCH="$CORE/capabilities.py.unified.patch"
python3 -c "from pathlib import Path; p=Path(r'$PATCH'); p.write_bytes(bytes.fromhex(Path(r'$HEX').read_text().replace(chr(10),'').replace(' ','')))"
cp -a "$TARGET" "${TARGET}.bak.$(date +%Y%m%d%H%M%S)"
(cd "$TOP" && patch -p1 < "$PATCH")
if ! grep -q 'class PhysicalDesignCapability' "$TARGET"; then
  echo "REFUSING: post-apply missing PhysicalDesignCapability — restore .bak" >&2
  exit 1
fi
if ! grep -q 'PhysicalDesignCapability()' "$TARGET"; then
  echo "REFUSING: post-apply missing REGISTRY entry — restore .bak" >&2
  exit 1
fi
echo "Applied physical_design capability registration to $TARGET"
echo "Restart the ASCENSION worker / Fly engine process to load the registry."
