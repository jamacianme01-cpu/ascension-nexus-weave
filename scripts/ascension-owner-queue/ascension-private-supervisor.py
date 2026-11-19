#!/usr/bin/env python3
"""Launch the owner's original cloud worker beside its private-volume transport."""
import os
import signal
import subprocess
import sys
import time

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
    workers.append(subprocess.Popen([
        '/usr/bin/python3', '-u', '-m', 'ASCENSION_CORE.cloud_queue_worker',
        '--root', root,
        '--queue-url', os.environ.get('ASCENSION_QUEUE_URL',
            'https://ascension-nexus-weave.fly.dev/api/public/ascension/execution-queue'),
        '--runner', os.environ.get('ASCENSION_QUEUE_RUNNER', 'fly-ascension-core'),
    ]))
    while not stopping:
        failed = next((proc for proc in workers if proc.poll() is not None), None)
        if failed is not None:
            # A child stopping is a worker failure, even when it returned code 0.
            # The supervisor must exit nonzero so Fly can restart the machine.
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
