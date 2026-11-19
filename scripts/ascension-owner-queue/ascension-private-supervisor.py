#!/usr/bin/env python3
"""Supervise the owner's ORIGINAL ASCENSION_CORE cloud queue worker and transport.

A crash in the original worker must not take down the queue transport and hide the
actual failure from ASCENSION's Book. Only restart the existing original worker
binary; never substitute a model or re-run an interrupted objective automatically.
"""
import http.client
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone

root = sys.argv[1] if len(sys.argv) > 1 else '/data/ascension/state/live'
runner = os.environ.get('ASCENSION_QUEUE_RUNNER', 'fly-ascension-core')
health_file = Path('/data/ascension/transport/worker-health.json')
stopping = False
workers = []

def status(state, **details):
    health_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {'state': state, 'updated_at': datetime.now(timezone.utc).isoformat(),
               'runner': runner, **details}
    temp = health_file.with_name('.worker-health-' + str(os.getpid()) + '.tmp')
    try:
        temp.write_text(json.dumps(payload), encoding='utf-8')
        os.replace(temp, health_file)
    finally:
        temp.unlink(missing_ok=True)

def shutdown(signum=None, _frame=None):
    global stopping
    stopping = True
    for child in workers:
        if child.poll() is None:
            child.terminate()

def report_crash():
    """Close only objectives abandoned by this exact crashed runner.

    Never requeue a possibly side-effectful objective: the owner must see the
    failed status and decide whether to submit a fresh one.
    """
    secret = os.environ.get('ASCENSION_PUBLISH_TOKEN', '')
    if not secret:
        return False
    conn = http.client.HTTPConnection('::1', 9091, timeout=10)
    try:
        payload = json.dumps({'runner': runner}).encode('utf-8')
        conn.request('POST', '/queue/worker-exited', body=payload, headers={
            'Content-Type': 'application/json',
            'x-ascension-publish-token': secret,
        })
        response = conn.getresponse()
        response.read(10000)
        return response.status == 200
    finally:
        conn.close()

def start_original_worker():
    return subprocess.Popen([
        '/usr/bin/python3', '-u', '-m', 'ASCENSION_CORE.cloud_queue_worker',
        '--root', root,
        '--queue-url', os.environ.get('ASCENSION_QUEUE_URL',
            'https://ascension-nexus-weave.fly.dev/api/public/ascension/execution-queue'),
        '--runner', runner,
    ])

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)
try:
    transport = subprocess.Popen([
        '/usr/bin/python3', '-u', '/app/ascension-volume-transport.py',
        '--live-root', root, '--transport-root', '/data/ascension/transport',
    ])
    workers.append(transport)
    worker = start_original_worker()
    workers.append(worker)
    restarts = 0
    heartbeat_at = time.monotonic()
    status('running', worker_pid=worker.pid, restarts=restarts)
    while not stopping:
        if transport.poll() is not None:
            print('ASCENSION_PRIVATE_TRANSPORT_EXITED exit_code=' + str(transport.returncode), flush=True)
            status('transport_failed', exit_code=transport.returncode)
            shutdown()
            break
        if worker.poll() is None and time.monotonic() - heartbeat_at >= 10:
            status('running', worker_pid=worker.pid, restarts=restarts)
            heartbeat_at = time.monotonic()
        if worker.poll() is not None:
            code = worker.returncode
            print('ASCENSION_ORIGINAL_CORE_WORKER_EXITED exit_code=' + str(code), flush=True)
            status('restarting_original_worker', exit_code=code, restarts=restarts)
            try:
                acknowledged = report_crash()
                print('ASCENSION_INTERRUPTED_OBJECTIVES_MARKED_FAILED=' + str(acknowledged), flush=True)
            except Exception as exc:
                print('ASCENSION_WORKER_CRASH_REPORT_FAILED ' + type(exc).__name__, flush=True)
            restarts += 1
            # Bound restart frequency without replacing the owner's authored code.
            delay = min(30, 2 ** min(restarts, 5))
            for _ in range(delay):
                if stopping or transport.poll() is not None:
                    break
                time.sleep(1)
            if stopping or transport.poll() is not None:
                continue
            workers.remove(worker)
            worker = start_original_worker()
            workers.append(worker)
            status('running', worker_pid=worker.pid, restarts=restarts)
            heartbeat_at = time.monotonic()
            print('ASCENSION_ORIGINAL_CORE_WORKER_RESTARTED count=' + str(restarts), flush=True)
        time.sleep(1)
finally:
    shutdown()
    for child in workers:
        try:
            child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
    status('stopped')
if not stopping:
    sys.exit(1)
