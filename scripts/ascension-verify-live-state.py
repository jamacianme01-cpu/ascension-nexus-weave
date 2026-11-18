#!/usr/bin/env python3
"""Read-only validation of the owner's LIVE_GOVERNED state on Fly."""
from pathlib import Path
import json
import sys
from ASCENSION_CORE.live_publication import LivePublicationStore

root = Path(sys.argv[1] if len(sys.argv) > 1 else '/data/ascension/state/live').resolve()
if root.parts[-2:] != ('state', 'live'):
    raise SystemExit('INVALID_LIVE_ROOT: expected path ending in state/live')
if not (root / 'published' / 'governed_state.json').is_file():
    raise SystemExit('MISSING_AUTHORITATIVE_PUBLICATION')
publication = LivePublicationStore(root / 'published').load()
if not publication:
    raise SystemExit('MISSING_GOVERNED_PUBLICATION')
print(json.dumps({
    'status': 'LIVE_GOVERNED_VALID',
    'revision': publication['publication_revision'],
    'publication_hash': publication['envelope_hash'],
    'source_root': str(root),
    'mutation': False,
}, sort_keys=True))
