#!/usr/bin/env python3
"""Launch the owner's original governed worker beside its secured Fly volume transport."""
import os
import signal
import subprocess
import sys
import time
from urllib.request import Request, urlopen

root = sys.argv[1] if len(sys.argv) > 1 else '/data/ascension/state/live'
workers = []
stopping = False
unexpected_child_exit = False

def shutdown(signum=None, _frame=None):
    global stopping
    stopping = True
    for child in workers:
        if child.poll() is None:
            child.terminate()

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)
try:
    workers.append(subprocess.Popen([
        '/usr/bin/python3', '-u', '/app/ascension-volume-transport.py',
        '--live-root', root, '--transport-root', '/data/ascension/transport',
    ]))
    # The private transport must accept authenticated requests before the
    # original cloud worker begins polling it; never alter authored engines.
    transport_ready = False
    for attempt in range(40):
        if stopping or workers[0].poll() is not None:
            break
        try:
            health = Request('http://[::1]:9091/health', headers={
                'x-ascension-publish-token': os.environ.get('ASCENSION_PUBLISH_TOKEN', ''),
            })
            with urlopen(health, timeout=1) as response:
                if response.status == 200:
                    transport_ready = True
                    break
        except Exception:
            time.sleep(.25)
    if not transport_ready and not stopping:
        unexpected_child_exit = True
        print('ASCENSION_PRIVATE_TRANSPORT_NOT_READY_FOR_CLOUD_WORKER', flush=True)
    if transport_ready and not stopping:
        workers.append(subprocess.Popen([
            '/usr/bin/python3', '-u', '-m', 'ASCENSION_CORE.cloud_queue_worker',
            '--root', root,
            '--queue-url', os.environ.get('ASCENSION_QUEUE_URL',
                'http://localhost:9091/api/public/ascension/execution-queue'),
            '--runner', os.environ.get('ASCENSION_QUEUE_RUNNER', 'fly-ascension-core'),
        ]))
    while transport_ready and not stopping:
        failed = next((proc for proc in workers if proc.poll() is not None), None)
        if failed is not None:
            unexpected_child_exit = True
            print('ASCENSION_PRIVATE_PROCESS_STOPPED exit_code=' + str(failed.returncode), flush=True)
            shutdown()
            break
        time.sleep(1)
finally:
    shutdown()
    for child in workers:
        try:
            child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
if unexpected_child_exit:
    sys.exit(1)
