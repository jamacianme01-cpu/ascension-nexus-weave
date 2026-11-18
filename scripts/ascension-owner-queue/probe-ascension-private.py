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
