#!/bin/sh
# Launch the existing ASCENSION website or the owner's original governed worker.
set -eu
role="${1:-app}"
case "$role" in
  app|/app/.output/server/index.mjs)
    test -f /app/.output/server/index.mjs || { echo >&2 'ASCENSION web bundle absent'; exit 2; }
    exec /usr/local/bin/bun /app/.output/server/index.mjs
    ;;
  worker)
    root="${ASCENSION_LIVE_ROOT:-/data/ascension/state/live}"
    test -f /app/ASCENSION_CORE/cloud_queue_worker.py || { echo >&2 'Original queue worker missing'; exit 2; }
    test -f /app/clarity/core_runtime.py || { echo >&2 'Original CLARITY support missing'; exit 2; }
    test -n "${ASCENSION_PUBLISH_TOKEN:-}" || { echo >&2 'ASCENSION_PUBLISH_TOKEN Fly secret missing'; exit 2; }
    test -f "$root/published/governed_state.json" || { echo >&2 'Authoritative state/live/published/governed_state.json missing; original state must be migrated first'; exit 2; }
    ASCENSION_LIVE_ROOT="$root" /usr/bin/python3 - <<'PY'
import os
from pathlib import Path
from ASCENSION_CORE.live_publication import LivePublicationStore
root = Path(os.environ['ASCENSION_LIVE_ROOT']).resolve()
if root.parts[-2:] != ('state', 'live'):
    raise SystemExit('Refusing noncanonical runtime root; must end with state/live')
publication = LivePublicationStore(root / 'published').load()
if not publication:
    raise SystemExit('No verified live governed publication; refusing empty state')
print('Governed state validated: revision', publication['publication_revision'], flush=True)
PY
    exec /usr/bin/python3 -u -m ASCENSION_CORE.cloud_queue_worker \
      --root "$root" \
      --queue-url "${ASCENSION_QUEUE_URL:-https://ascension-nexus-weave.fly.dev/api/public/ascension/execution-queue}" \
      --runner "${ASCENSION_QUEUE_RUNNER:-fly-ascension-core}"
    ;;
  *) echo >&2 "Unrecognized ASCENSION role: $role"; exit 2 ;;
esac
