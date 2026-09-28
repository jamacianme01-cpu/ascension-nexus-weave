"""Persistent outbound queue worker with a local, unverified answer draft.

The governed ASCENSION worker still executes and publishes its own results.
This bridge sends local model text separately so a verified receipt cannot be
mistaken for the requested answer.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import time
from pathlib import Path

from .cloud_queue_worker import CloudQueueWorker, QueueClient, DEFAULT_QUEUE_URL
from .local_answer import generate_local_draft


class LocalAnswerWorker(CloudQueueWorker):
    def process_pending(self, pending):
        cloud_id = pending["cloud_request_id"]
        local_id = pending["local_request_id"]
        previous = self.store.load(local_id)
        if not previous or previous.get("status") not in {
            "PERSISTED", "REJECTED", "FAILED", "VERIFIED_UNPUBLISHED",
            "BLOCKED_TRANSACTION_RECOVERY",
        }:
            try:
                draft = generate_local_draft(
                    pending["objective"], pending["evidence"], pending["constraints"]
                )
                self.client.report(
                    cloud_id,
                    "running",
                    stage="local_answer_delivered",
                    draft=draft,
                    draft_model=os.getenv("LOCAL_LLM_MODEL", "qwen3-ascension"),
                )
            except Exception as exc:
                # A failed draft does not become governed success. The core can
                # still execute; the website shows a missing result honestly.
                print(json.dumps({"local_draft": "failed", "request_id": cloud_id,
                                  "error": str(exc)[:500]}), flush=True)
        return super().process_pending(pending)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(Path(__file__).resolve().parent / "state" / "live"))
    parser.add_argument("--queue-url", default=os.getenv("ASCENSION_QUEUE_URL", DEFAULT_QUEUE_URL))
    parser.add_argument("--runner", default=os.getenv("ASCENSION_QUEUE_RUNNER", socket.gethostname()))
    parser.add_argument("--poll-seconds", type=float, default=3.0)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    token = os.getenv("ASCENSION_PUBLISH_TOKEN", "").strip()
    if not token:
        print(json.dumps({"status": "BLOCKED", "error": "ASCENSION_PUBLISH_TOKEN is required"}), flush=True)
        return 2
    worker = LocalAnswerWorker(Path(args.root), QueueClient(args.queue_url, token, args.runner))
    while True:
        try:
            result = worker.run_once()
            if result is not None:
                print(json.dumps({"status": "PROCESSED", **result}, sort_keys=True), flush=True)
            elif args.once:
                print(json.dumps({"status": "IDLE"}), flush=True)
        except (RuntimeError, ValueError, OSError) as exc:
            print(json.dumps({"status": "ERROR", "error": str(exc)}), flush=True)
            if args.once:
                return 1
        if args.once:
            return 0
        time.sleep(max(1.0, args.poll_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
