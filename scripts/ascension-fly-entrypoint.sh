#!/bin/sh
# Fly ASCENSION launcher: web and original governed worker share the same image.
set -eu
role="${1:-web}"
case "$role" in
  web)
    test -f /app/.output/server/index.mjs || { echo >&2 "ASCENSION web bundle missing"; exit 2; }
    exec /usr/local/bin/bun /app/.output/server/index.mjs
    ;;
  worker)
    test -f /app/ASCENSION_CORE/cloud_queue_worker.py || { echo >&2 "Private ASCENSION_CORE missing"; exit 2; }
    test -f /app/clarity/core_runtime.py || { echo >&2 "Private CLARITY support package missing"; exit 2; }
    test -d /data/ascension || { echo >&2 "Persistent ASCENSION state volume not mounted"; exit 2; }
    test -n "${ASCENSION_PUBLISH_TOKEN:-}" || { echo >&2 "ASCENSION_PUBLISH_TOKEN Fly secret missing"; exit 2; }
    cd /app
    exec python3 -u -m ASCENSION_CORE.cloud_queue_worker \
      --root /data/ascension \
      --queue-url "${ASCENSION_QUEUE_URL:-https://ascension-nexus-weave.fly.dev/api/public/ascension/execution-queue}" \
      --runner "${ASCENSION_QUEUE_RUNNER:-fly-ascension-core}"
    ;;
  *)
    echo >&2 "Unknown ASCENSION process role: $role"
    exit 2
    ;;
esac
