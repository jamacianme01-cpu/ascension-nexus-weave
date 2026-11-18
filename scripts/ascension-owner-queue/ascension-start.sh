#!/bin/sh
# Preserve original ASCENSION_CORE; bring up the private queue beside it.
set -eu
role="${1:-app}"
case "$role" in
  app|/app/.output/server/index.mjs)
    test -f /app/.output/server/index.mjs || { echo >&2 'Original ASCENSION web bundle missing'; exit 2; }
    exec /usr/local/bin/bun /app/.output/server/index.mjs
    ;;
  worker)
    test "${ASCENSION_STATE_BOOTSTRAP:-0}" = '0' || { echo >&2 'Worker bootstrap is still paused'; exit 2; }
    root="${ASCENSION_LIVE_ROOT:-/data/ascension/state/live}"
    test -f /app/ASCENSION_CORE/cloud_queue_worker.py || { echo >&2 'Original queue worker missing'; exit 2; }
    test -f /app/clarity/core_runtime.py || { echo >&2 'Original CLARITY support missing'; exit 2; }
    test -n "${ASCENSION_PUBLISH_TOKEN:-}" || { echo >&2 'Fly ASCENSION_PUBLISH_TOKEN missing'; exit 2; }
    test -f "$root/published/governed_state.json" || { echo >&2 'Original LIVE_GOVERNED publication missing'; exit 2; }
    ASCENSION_LIVE_ROOT="$root" /usr/bin/python3 - <<'PY'
import os
from pathlib import Path
from ASCENSION_CORE.live_publication import LivePublicationStore
root=Path(os.environ['ASCENSION_LIVE_ROOT']).resolve()
if root.parts[-2:] != ('state','live'):
    raise SystemExit('Canonical state/live root required')
publication=LivePublicationStore(root/'published').load()
if not publication:
    raise SystemExit('Original governed publication is not valid')
print('Governed publication validated, revision',publication['publication_revision'],flush=True)
PY
    exec /usr/bin/python3 -u /app/ascension-private-supervisor.py "$root"
    ;;
  *) echo >&2 "Invalid ASCENSION process role: $role"; exit 2 ;;
esac
