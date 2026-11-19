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


# Identify whether the original engine advertises the already-requested
# physical/robotic design capability, without logging private source or designs.
try:
    from ASCENSION_CORE import capabilities
    offerings = capabilities.advertise_all()
    physical = []
    for offer in offerings if isinstance(offerings, list) else []:
        if not isinstance(offer, dict):
            continue
        searchable = json.dumps({
            'capability_id': offer.get('capability_id', ''),
            'output_contract': offer.get('output_contract', ''),
            'accepted_intent_tokens': offer.get('accepted_intent_tokens', []),
        }).lower()
        if any(word in searchable for word in ('robot', 'drone', 'physical', 'hardware', 'blueprint', '3d_model')):
            physical.append({'available': offer.get('available') is True})
    print('ASCENSION_PHYSICAL_DESIGN_CAPABILITY',
          json.dumps({'catalog_readable': True, 'advertised': bool(physical),
                      'available': any(item['available'] for item in physical)}))
except Exception as exc:
    print('ASCENSION_PHYSICAL_DESIGN_CAPABILITY',
          json.dumps({'catalog_readable': False, 'diagnostic_type': type(exc).__name__}))

# Only log status-code-shaped contract fields for the latest rejected objective.
for file in recent[:2]:
    try:
        run = json.loads(file.read_text(encoding='utf-8')).get('run', {})
        if run.get('status') != 'rejected':
            continue
        result = run.get('result') if isinstance(run.get('result'), dict) else {}
        output = result.get('requested_output') if isinstance(result.get('requested_output'), dict) else {}
        relevant = {}
        for key in ('output_contract', 'requested_type', 'primary_artifact', 'truth_status'):
            value = output.get(key)
            if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,80}', value):
                relevant[key] = value
        print('ASCENSION_REJECTED_OUTPUT_CONTRACT', json.dumps(relevant))
        break
    except (OSError, TypeError, ValueError):
        continue
