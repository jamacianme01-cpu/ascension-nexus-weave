#!/usr/bin/env python3
"""Read-only authenticated health probe against this Fly worker's private queue."""
import json
import os
from urllib.request import Request, urlopen

url = 'http://[::1]:9091/health'
secret = os.environ.get('ASCENSION_PUBLISH_TOKEN', '')
if not secret:
    raise SystemExit('ASCENSION_PUBLISH_TOKEN_MISSING')
with urlopen(Request(url, headers={'x-ascension-publish-token': secret}), timeout=10) as response:
    payload = json.load(response)
if payload.get('status') != 'LIVE_GOVERNED_TRANSPORT':
    raise SystemExit('ASCENSION_PRIVATE_TRANSPORT_NOT_READY')
print('ASCENSION_PRIVATE_VOLUME_TRANSPORT_CONNECTED revision_at_start=' + str(payload.get('original_publication_revision_at_start')))
# Report queue status counts only; do not expose objectives, tokens or artifacts.
from collections import Counter
from pathlib import Path
queue_dir = Path('/data/ascension/transport/runs')
counts = Counter()
for file in queue_dir.glob('*.json'):
    try:
        with file.open(encoding='utf-8') as handle:
            state = json.load(handle).get('run', {}).get('status', 'unknown')
        counts[str(state)] += 1
    except (OSError, ValueError, TypeError):
        counts['unreadable'] += 1
print('ASCENSION_PRIVATE_QUEUE_STATES ' + json.dumps(dict(counts), sort_keys=True))

