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
# Read-only, no objectives, tokens, artifacts, or owner source in CI logs.
from pathlib import Path
import re
root = Path('/data/ascension/transport/runs')
recent = sorted(root.glob('*.json'), key=lambda f: f.stat().st_mtime, reverse=True)[:8]
report = []
for file in recent:
    try:
        run = json.loads(file.read_text(encoding='utf-8')).get('run', {})
        safe = {}
        for key in ('status', 'stage', 'guardian_verdict', 'outcome_status'):
            value = run.get(key)
            safe[key] = value[:80] if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,80}', value) else None
        safe['error_reported'] = bool(run.get('error'))
        safe['has_governed_result'] = isinstance(run.get('result'), dict)
        report.append(safe)
    except (OSError, ValueError, TypeError):
        report.append({'status': 'unreadable'})
print('ASCENSION_PRIVATE_RECENT_QUEUE_STATES ' + json.dumps(report))

