#!/usr/bin/env python3
"""Owner-governed ASCENSION transport on the existing Fly volume.

This transports submissions and verbatim runtime reports; it never runs an
objective, creates a Knowledgeverse, infers outcomes, or changes the authored
ASCENSION_CORE Python modules. Only an internal authenticated Fly peer can call.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import secrets
import socket
import threading
import uuid
from datetime import datetime, timezone
from ascension_crystal_ledger import CrystalLedger
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


lock = threading.RLock()


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def uuid_str(value):
    if not isinstance(value, str):
        raise ValueError('UUID required')
    parsed = str(uuid.UUID(value))
    if parsed != value.lower():
        raise ValueError('Canonical UUID required')
    return parsed


def hash_token(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def load_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return None


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name('.' + path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with tmp.open('x', encoding='utf-8') as handle:
            json.dump(value, handle, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass


class TransportStore:
    def __init__(self, live_root: Path, transport_root: Path):
        self.live_root = live_root.resolve()
        self.root = transport_root.resolve()
        if tuple(self.live_root.parts[-2:]) != ('state', 'live'):
            raise ValueError('Authoritative live root must end in state/live')
        self.pub_path = self.live_root / 'published' / 'governed_state.json'
        if not self.pub_path.is_file():
            raise ValueError('Original ASCENSION publication must exist before transport opens')
        from ASCENSION_CORE.live_publication import LivePublicationStore
        pub = LivePublicationStore(self.pub_path.parent).load()
        if not pub or pub.get('publication_revision', 0) < 1:
            raise ValueError('Authoritative governed publication is invalid')
        self.initial_revision = pub['publication_revision']
        self.runs = self.root / 'runs'
        self.runs.mkdir(parents=True, exist_ok=True)
        self.crystal_ledger = CrystalLedger(self)

    def file(self, request_id):
        return self.runs / (uuid_str(request_id) + '.json')

    def submit(self, payload):
        objective = payload.get('objective')
        evidence, constraints = payload.get('evidence'), payload.get('constraints')
        if not isinstance(objective, str) or not 3 <= len(objective.strip()) <= 4000:
            raise ValueError('Objective must be 3–4000 characters')
        for field, value in [('evidence', evidence), ('constraints', constraints)]:
            if value is not None and (not isinstance(value, list) or len(value) > 32
                                      or any(not isinstance(v, str) or len(v) > 2000 for v in value)):
                raise ValueError('Invalid ' + field)
        previous = payload.get('parentRequestId')
        if previous is not None:
            parent = self.authorized(previous, payload.get('parentGuestToken'))
            if not parent:
                raise ValueError('Parent objective unavailable')
            if payload.get('followUp') not in ('continue', 'refine'):
                raise ValueError('Invalid objective follow-up')
            prior = {'source': 'ASCENSION_PARENT', 'request_id': parent['run']['id'],
                     'objective': parent['run']['objective'],
                     'result': parent['run'].get('result'), 'follow_up': payload['followUp']}
            evidence = (evidence or []) + [json.dumps(prior, separators=(',', ':'))[:60000]]
        request_id, token = str(uuid.uuid4()), str(uuid.uuid4())
        now = utc_now()
        run = {'engine': 'governed_runtime', 'id': request_id,
               'objective': objective.strip(), 'evidence': evidence or [],
               'constraints': constraints or [], 'status': 'queued', 'stage': None,
               'claimed_at': None, 'claimed_by': None, 'completed_at': None,
               'runtime_revision': None, 'transition_id': None,
               'guardian_verdict': None, 'outcome_status': None,
               'accepted_delta': None, 'result': None, 'error': None,
               'created_at': now, 'updated_at': now, 'submitted_by': None,
               'submitted_via': 'web'}
        envelope = {'run': run, 'guest_token_hash': hash_token(token), 'artifacts': []}
        with lock:
            atomic_json(self.file(request_id), envelope)
        return {'request': run, 'guestToken': token}

    def authorized(self, request_id, token):
        if not isinstance(token, str) or len(token) != 36:
            return None
        with lock:
            item = load_json(self.file(request_id))
        if not item or not hmac.compare_digest(item.get('guest_token_hash', ''), hash_token(token)):
            return None
        return item

    def status(self, payload):
        item = self.authorized(payload.get('requestId'), payload.get('guestToken'))
        return {'request': item['run'] if item else None}

    def bundle(self, payload):
        item = self.authorized(payload.get('requestId'), payload.get('guestToken'))
        return {'run': item['run'], 'artifacts': item.get('artifacts', [])} if item else {'run': None}

    def claim(self, runner):
        if not isinstance(runner, str) or not 1 <= len(runner) <= 200:
            raise ValueError('Invalid worker runner')
        with lock:
            candidates = []
            for p in self.runs.glob('*.json'):
                item = load_json(p)
                if item and item.get('run', {}).get('status') == 'queued':
                    candidates.append((item['run']['created_at'], p, item))
            if not candidates:
                return {'item': None}
            _, p, item = min(candidates, key=lambda x: (x[0], str(x[1])))
            run = item['run']
            now = utc_now()
            run.update({'status': 'claimed', 'claimed_at': now, 'claimed_by': runner,
                        'stage': 'cloud_claimed', 'updated_at': now})
            atomic_json(p, item)
            return {'item': {key: run[key] for key in ('id', 'objective', 'evidence',
                                                       'constraints', 'submitted_by',
                                                       'submitted_via', 'created_at')}}

    def report(self, payload):
        request_id = payload.get('request_id')
        status = payload.get('status')
        if status not in ('claimed', 'running', 'verified', 'failed', 'rejected'):
            raise ValueError('Invalid report status')
        with lock:
            p = self.file(request_id)
            item = load_json(p)
            if not item:
                raise ValueError('Unknown queue request')
            run = item['run']
            old = run['status']
            if old in ('verified', 'failed', 'rejected'):
                if status != old:
                    raise ValueError('Terminal result cannot be overwritten')
                return {'ok': True, 'id': request_id, 'status': old}
            if old not in ('claimed', 'running'):
                raise ValueError('Cannot report an unclaimed objective')
            if old == 'running' and status == 'claimed':
                raise ValueError('Cannot regress a running objective')
            if status == 'verified' and not isinstance(payload.get('result'), dict):
                raise ValueError('VERIFIED requires the original governed result')
            allowed = ('stage','runtime_revision','transition_id','guardian_verdict',
                       'outcome_status','accepted_delta','result','error')
            for key in allowed:
                if key in payload:
                    run[key] = payload[key]
            run['status'] = status
            run['updated_at'] = utc_now()
            if status in ('verified', 'failed', 'rejected'):
                run['completed_at'] = run['updated_at']
            if 'artifacts' in payload:
                artifacts = payload['artifacts']
                if not isinstance(artifacts, list) or len(artifacts) > 8:
                    raise ValueError('Invalid governed artifact transport')
                for file in artifacts:
                    if not isinstance(file, dict) or not isinstance(file.get('name'), str) or not isinstance(file.get('content'), str):
                        raise ValueError('Invalid governed artifact')
                    if len(file['name']) > 120 or '..' in file['name'] or '/' in file['name'] or '\\' in file['name'] or len(file['content']) > 100000:
                        raise ValueError('Invalid governed artifact name or size')
                item['artifacts'] = artifacts
            atomic_json(p, item)
        return {'ok': True, 'id': request_id, 'status': status}


class IPv6Server(ThreadingHTTPServer):
    address_family = socket.AF_INET6
    daemon_threads = True


class IPv4Server(ThreadingHTTPServer):
    address_family = socket.AF_INET
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    server_version = 'ASCENSION-Private-Transport/1'

    def log_message(self, format, *args):
        if os.environ.get('ASCENSION_TRANSPORT_DEBUG') == '1':
            super().log_message(format, *args)

    def respond(self, status, value):
        encoded = json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def handle_request(self):
        expected = os.environ.get('ASCENSION_PUBLISH_TOKEN', '').strip()
        provided = self.headers.get('x-ascension-publish-token', '')
        if not expected or not hmac.compare_digest(expected, provided):
            return self.respond(401, {'error': 'unauthorized'})
        store = self.server.ascension_store
        try:
            if self.command == 'GET':
                if self.path.startswith('/health'):
                    return self.respond(200, {'status': 'LIVE_GOVERNED_TRANSPORT',
                                              'original_publication_revision_at_start': store.initial_revision,
                                              'persistent_volume': True})
                if self.path.startswith('/queue/claim?'):
                    from urllib.parse import urlsplit, parse_qs
                    runner = parse_qs(urlsplit(self.path).query).get('runner', ['fly-ascension-core'])[0]
                    return self.respond(200, store.claim(runner))
                return self.respond(404, {'error':'not_found'})
            if self.command != 'POST':
                return self.respond(405, {'error': 'method_not_allowed'})
            length = int(self.headers.get('content-length', '0'))
            if length < 2 or length > 1500000:
                return self.respond(413, {'error': 'request_size_invalid'})
            raw = self.rfile.read(length)
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError('JSON object expected')
            routes = {
                '/guest/submit': store.submit,
                '/guest/status': store.status,
                '/guest/bundle': store.bundle,
                '/queue/report': store.report,
                '/crystals/list': store.crystal_ledger.list,
                '/crystals/record': store.crystal_ledger.record,
                '/crystals/inspect': store.crystal_ledger.inspect,
                '/crystals/confirm': store.crystal_ledger.confirm,
            }
            action = routes.get(self.path)
            if not action:
                return self.respond(404, {'error': 'not_found'})
            return self.respond(200, action(payload))
        except (ValueError, TypeError, KeyError) as exc:
            return self.respond(400, {'error': str(exc)[:200]})
        except Exception as exc:
            print('ASCENSION private transport failure:', type(exc).__name__, flush=True)
            return self.respond(500, {'error': 'ASCENSION_PRIVATE_TRANSPORT_FAILURE'})

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--live-root', default=os.environ.get('ASCENSION_LIVE_ROOT', '/data/ascension/state/live'))
    parser.add_argument('--transport-root', default='/data/ascension/transport')
    parser.add_argument('--port', type=int, default=9091)
    # Default keeps the existing private IPv6 worker unchanged.
    # Owner-computer mode explicitly binds 127.0.0.1 (not the public network).
    parser.add_argument('--host', default=os.environ.get('ASCENSION_TRANSPORT_HOST', '::'))
    args = parser.parse_args()
    if not os.environ.get('ASCENSION_PUBLISH_TOKEN', '').strip():
        raise SystemExit('ASCENSION_PUBLISH_TOKEN is required')
    if args.host not in ('::', '::1', '127.0.0.1', 'localhost'):
        raise SystemExit('ASCENSION private transport may only bind localhost or the governed private IPv6 default')
    store = TransportStore(Path(args.live_root), Path(args.transport_root))
    server = IPv6Server if ':' in args.host else IPv4Server
    bind_host = '127.0.0.1' if args.host == 'localhost' else args.host
    httpd = server((bind_host, args.port), Handler)
    httpd.ascension_store = store
    print('ASCENSION_OWNER_TRANSPORT_READY root=/data/ascension revision_at_start=' + str(store.initial_revision), flush=True)
    # Continues running on the existing persistent worker, even when the web
    # browser and web process are stopped. No new service is deployed.
    def crystal_growth_cycle():
        import time
        time.sleep(30)
        while True:
            try:
                result = store.crystal_ledger.advance_once()
                if result['queued'] or result['failures']:
                    print('ASCENSION_CRYSTAL_CYCLE queued=' + str(result['queued']) +
                          ' failures=' + str(result['failures']), flush=True)
            except Exception as exc:
                print('ASCENSION_CRYSTAL_CYCLE_FAILED type=' + type(exc).__name__, flush=True)
            time.sleep(1800)
    threading.Thread(target=crystal_growth_cycle, name='ascension-crystal-growth', daemon=True).start()
    httpd.serve_forever(poll_interval=.5)


if __name__ == '__main__':
    main()
