"""Paired ASCENSION old-PC hub: outbound, governed observation and objective queue.

No legacy publish token, inbound PC port, fabricated state, or engine bypass.
--observations-only verifies and relays real gateway publications without
claiming objectives while the governed runtime capability is unavailable.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

SURFACES = ("/snapshot", "/status", "/knowledgeverse", "/pathways",
            "/governance", "/outcomes", "/galaxy-bridges", "/manifestation",
            "/ledger", "/chamber")
SITE = "https://ascensionweave.app"


def observe(gateway, path):
    """Return the gateway's exact body and HTTP status, including documented 503."""
    req = Request(gateway + "/api/ascension/v1" + path,
                  headers={"accept": "application/json"})
    try:
        with urlopen(req, timeout=20) as response:
            return {"text": response.read().decode("utf-8"), "status": response.status}
    except HTTPError as exc:
        if exc.code != 503:
            raise RuntimeError("Local gateway " + path + " returned HTTP " + str(exc.code)) from exc
        # An unavailable OPTIONAL surface must remain unavailable (HTTP 503);
        # do not let it prevent valid governed /snapshot from being published.
        return {"text": exc.read().decode("utf-8"), "status": 503}


def relay_observations(gateway, key):
    documents = {path: observe(gateway, path) for path in SURFACES}
    if documents["/snapshot"]["status"] != 200:
        raise RuntimeError("Local /snapshot is unavailable (HTTP " +
                           str(documents["/snapshot"]["status"]) + ")")
    snap = json.loads(documents["/snapshot"]["text"])
    if snap.get("availability") not in ("available", "last_verified") or not snap.get("snapshot_hash"):
        raise RuntimeError("Real governed snapshot unavailable; not relaying unverified state")
    content = snap.get("content") or {}
    for form in (content.get("knowledge_forms") or [])[:40]:
        entity = form.get("entity_id") if isinstance(form, dict) else None
        if isinstance(entity, str) and entity:
            path = "/library-card/" + quote(entity, safe="")
            documents[path] = observe(gateway, path)

    for path, document in documents.items():
        if document["status"] == 503:
            print("LOCAL SURFACE UNAVAILABLE: " + path + " (HTTP 503; preserved)", flush=True)

    raw = json.dumps({
        "revision": content.get("snapshot_revision"),
        "source_classification": (content.get("publication_provenance") or {}).get("source_classification"),
        "documents": documents,
    }, ensure_ascii=False).encode("utf-8")
    req = Request(SITE + "/api/public/ascension/relay", method="POST", data=raw,
                  headers={"content-type": "application/json", "x-ascension-hub-key": key})
    try:
        with urlopen(req, timeout=30) as response:
            ack = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError("Hosted relay rejected push (HTTP " + str(exc.code) + ")") from exc
    if ack.get("ok") is not True:
        raise RuntimeError("Hosted relay did not acknowledge publication")

    # Byte-identical readback preserves browser-side snapshot hash validation.
    try:
        with urlopen(SITE + "/api/public/ascension/v1/snapshot", timeout=30) as response:
            readback = response.read().decode("utf-8")
    except HTTPError as exc:
        raise RuntimeError("Hosted snapshot readback returned HTTP " + str(exc.code)) from exc
    if readback != documents["/snapshot"]["text"]:
        raise RuntimeError("Hosted readback differs from local governed snapshot")
    return content.get("snapshot_revision")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--observations-only", action="store_true",
                        help="Publish live gateway state without claiming or rejecting cloud objectives")
    parser.add_argument("--gateway", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    key = os.environ.get("ASCENSION_HUB_KEY", "").strip().lower()
    if len(key) != 96 or any(c not in "0123456789abcdef" for c in key):
        raise ValueError("A 48-byte paired hub key is required")

    # Observation-only requires no queue/core imports: only the existing local gateway.
    worker = None
    if not args.observations_only:
        root = Path(args.root).resolve()
        sys.path.insert(0, str(root))
        from ASCENSION_CORE.cloud_queue_worker import QueueClient, CloudQueueWorker
        client = QueueClient(SITE + "/api/public/ascension/execution-queue",
                             key, socket.gethostname())
        worker = CloudQueueWorker(root / "ASCENSION_CORE" / "state" / "live", client)

    next_push = 0.0
    while True:
        if time.monotonic() >= next_push:
            try:
                revision = relay_observations(args.gateway.rstrip("/"), key)
                print("WEB SNAPSHOT VERIFIED: revision", revision, flush=True)
            except (RuntimeError, ValueError, HTTPError, URLError, OSError) as exc:
                print("Observation not connected:", str(exc)[:300], flush=True)
                if args.once:
                    return 1
            next_push = time.monotonic() + 60
        if args.observations_only:
            if args.once:
                return 0
            time.sleep(3)
            continue
        try:
            result = worker.run_once()
            if result is not None:
                print("GOVERNED OBJECTIVE:", json.dumps(result, sort_keys=True), flush=True)
                # Versions are produced only after a real governed completion,
                # using the three published branch identities. Never invent
                # versions for rejected or unavailable objectives.
                if result.get("cloud_status") == "verified" and result.get("local_status") == "PERSISTED":
                    request_id = result.get("cloud_request_id")
                    script = Path(__file__).resolve().with_name("ascension_version_worker.py")
                    if request_id and script.is_file():
                        print("GENERATING FOUR DISTINCT OUTPUT VERSIONS:", request_id, flush=True)
                        try:
                            outcome = subprocess.run(
                                [sys.executable, "-B", str(script), "--root", str(root),
                                 "--request-id", str(request_id)],
                                timeout=780, check=False,
                            )
                            if outcome.returncode != 0:
                                print("OUTPUT VERSIONS NOT COMPLETE: see messages above", flush=True)
                        except (OSError, subprocess.TimeoutExpired) as exc:
                            print("OUTPUT VERSION ADAPTER FAILED:", type(exc).__name__, flush=True)
            elif args.once:
                print("HUB IDLE: no queued objective", flush=True)
        except (RuntimeError, ValueError, HTTPError, URLError, OSError) as exc:
            print("Objective queue unavailable:", str(exc)[:300], flush=True)
            if args.once:
                return 1
        if args.once:
            return 0
        time.sleep(3)


if __name__ == "__main__":
    raise SystemExit(main())
