"""Existing private ASCENSION transport: durable one-crystal-per-intent storage.

This never changes original ASCENSION_CORE files, creates extra AI providers,
deploys infrastructure, or turns a queued run into a verified discovery.
It stores Library Card capabilities only as SHA-256 file names. Actual governed
run tokens are checked through TransportStore.authorized before any write.

The worker volume (not the auto-stopping web server) owns the crystal ledgers,
with a bounded local cycle for autonomous continuation while the browser is away.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

_CARD = re.compile(r"^[a-f0-9]{64}$")
_IDENT = re.compile(r"^[a-f0-9-]{36}$")
_MAX = 128
_MIN_GROWTH_INTERVAL = 12 * 60 * 60
_MAX_QUEUED_PER_CYCLE = 2
_SKIP_PREFIX = ("knowledgeform_",)
_SKIP_NAMES = {
    "readme.md", "governed_objective.json", "artifact_manifest.json",
    "verification.json", "acceptance_result.json", "metadata.json",
    "lineage.json", "ascension_readme.md",
}


def _atomic_json(file, records):
    """Commit a complete ledger atomically, with private file permissions."""
    tmp = file.with_name("." + file.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with tmp.open("x", encoding="utf-8") as handle:
            json.dump(records, handle, separators=(",", ":"), ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, file)
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass


def _now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _seconds(value):
    if not isinstance(value, str) or not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return 0.0


def _uuid(value):
    if not isinstance(value, str) or not _IDENT.fullmatch(value):
        raise ValueError("Valid crystal or governed request UUID required")
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise ValueError("Valid crystal or governed request UUID required") from exc


def _valid_card(payload):
    key = payload.get("libraryKey") if isinstance(payload, dict) else None
    if not isinstance(key, str) or not _CARD.fullmatch(key):
        raise ValueError("Valid Library Card capability required")
    return key


def _governed_persisted(run):
    """The same strict persistence conditions as result-model.governedPersisted."""
    result = run.get("result") if isinstance(run.get("result"), dict) else {}
    pub = result.get("publication") if isinstance(result.get("publication"), dict) else {}
    return (
        run.get("engine") == "governed_runtime"
        and run.get("status") == "verified"
        and result.get("transaction") == "PERSISTED"
        and result.get("autosync_verdict") == "VERIFIED"
        and pub.get("delta_in_persisted_ledger") is True
        and isinstance(run.get("runtime_revision"), int)
        and run["runtime_revision"] > 0
    )


def _has_delivered_artifact(bundle):
    """Conservative positive evidence; never treat receipts or Knowledge Forms as output."""
    run = bundle["run"]
    result = run.get("result") if isinstance(run.get("result"), dict) else {}
    for name in ("objective_delivery", "delivery", "response_payload"):
        payload = result.get(name)
        if (isinstance(payload, dict) and payload.get("kind") != "not_produced"
                and isinstance(payload.get("body"), str)
                and payload["body"].strip()):
            return True
    for file in bundle.get("artifacts", []):
        if not isinstance(file, dict):
            continue
        filename = str(file.get("name", "")).lower()
        content = file.get("content")
        if (not filename or filename in _SKIP_NAMES
                or filename.startswith(_SKIP_PREFIX)
                or not isinstance(content, str) or len(content.strip()) < 48):
            continue
        if filename.endswith((".md", ".txt", ".json", ".svg", ".html", ".py", ".ts", ".tsx")):
            return True
    return False


def _snapshot(bundle):
    run = bundle["run"]
    return {
        "requestId": run["id"],
        "guestToken": bundle["_token"],
        "revision": run["runtime_revision"],
        "completedAt": run.get("completed_at") or run.get("updated_at") or _now(),
    }


def _summary(item):
    verified = item.get("lastVerified")
    history = item.get("history")
    return {
        "id": item["id"],
        "intent": item["intent"],
        "createdAt": item["createdAt"],
        "updatedAt": item["updatedAt"],
        "verifiedRevision": item.get("verifiedRevision"),
        "verifiedAt": item.get("verifiedAt"),
        "verifiedGrowthCount": len(history) if isinstance(history, list) else (1 if verified else 0),
        "developing": bool(item.get("lastAutoQueuedAt") and item["requestId"] !=
                           (verified or {}).get("requestId")),
    }


def _append(item, verified):
    history = item.get("history")
    if not isinstance(history, list):
        history = []
    if not any(record.get("requestId") == verified["requestId"] for record in history):
        history.append(verified)
    item["history"] = history[-64:]
    item["lastVerified"] = verified
    item["verifiedRevision"] = verified["revision"]
    item["verifiedAt"] = verified["completedAt"]


class CrystalLedger:
    def __init__(self, transport):
        self.transport = transport
        self.root = transport.root / "intent-crystals"
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def _path(self, library_key):
        return self.root / (hashlib.sha256(library_key.encode("ascii")).hexdigest() + ".json")

    def _read(self, library_key):
        value = self._path(library_key)
        if not value.is_file():
            return []
        data = json.loads(value.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Stored Library Card is invalid")
        return data

    def _save(self, library_key, records):
        # Use the existing transport's atomic write behavior and enforce private
        # permissions on the completed stored ledger.
        _atomic_json(self._path(library_key), records)

    def _authorized_bundle(self, request_id, token):
        bundle = self.transport.authorized(_uuid(request_id), _uuid(token))
        if bundle is None:
            raise ValueError("Governed run authorization failed")
        return bundle

    def list(self, payload):
        key = _valid_card(payload)
        with self.lock:
            return [_summary(record) for record in self._read(key)]

    def record(self, payload):
        key = _valid_card(payload)
        intent = payload.get("intent")
        if not isinstance(intent, str) or not 1 <= len(intent.strip()) <= 4000:
            raise ValueError("Valid original intent required")
        request_id = _uuid(payload.get("requestId"))
        guest_token = _uuid(payload.get("guestToken"))
        self._authorized_bundle(request_id, guest_token)
        crystal_id = payload.get("crystalId")
        parent = payload.get("parentRequestId")
        with self.lock:
            records = self._read(key)
            existing = next((r for r in records if r["id"] == _uuid(crystal_id)), None) if crystal_id else None
            if crystal_id and not existing:
                raise ValueError("This crystal is not associated with the Library Card")
            if existing and (_uuid(parent) if parent else None) != existing["requestId"]:
                raise ValueError("Crystal evolved since continuation began; retrieve latest version")
            if not existing and len(records) >= _MAX:
                raise ValueError("Library Card crystal limit reached")
            now = _now()
            if existing:
                old_bundle = self._authorized_bundle(existing["requestId"], existing["guestToken"])
                if _governed_persisted(old_bundle["run"]) and _has_delivered_artifact(old_bundle):
                    old_bundle["_token"] = existing["guestToken"]
                    _append(existing, _snapshot(old_bundle))
                item = existing
            else:
                item = {
                    "id": str(uuid.uuid4()), "intent": intent.strip(),
                    "createdAt": now, "verifiedRevision": None, "verifiedAt": None,
                }
                records.append(item)
            item["requestId"], item["guestToken"], item["updatedAt"] = request_id, guest_token, now
            self._save(key, records)
            return _summary(item)

    def inspect(self, payload):
        key = _valid_card(payload)
        crystal_id = _uuid(payload.get("crystalId"))
        with self.lock:
            records = self._read(key)
            item = next((r for r in records if r["id"] == crystal_id), None)
            if item is None:
                raise ValueError("Intent crystal is not on the Library Card")
            current = self._authorized_bundle(item["requestId"], item["guestToken"])
            # Never expose other Library Cards or unrelated guest token details.
            previous = item.get("lastVerified")
            last = (self._authorized_bundle(previous["requestId"], previous["guestToken"])
                    if isinstance(previous, dict) else None)
            return {
                "crystal": _summary(item),
                "status": current["run"].get("status", "unavailable"),
                "continuation": {"requestId": item["requestId"], "guestToken": item["guestToken"]},
                "lastVerified": previous,
                "run": current["run"],
                "previousRun": last["run"] if last else None,
            }

    def confirm(self, payload):
        key = _valid_card(payload)
        crystal_id = _uuid(payload.get("crystalId"))
        request_id = _uuid(payload.get("requestId"))
        token = _uuid(payload.get("guestToken"))
        current = self._authorized_bundle(request_id, token)
        if not _governed_persisted(current["run"]):
            raise ValueError("Only real persisted governed results can grow a crystal")
        # The web projection must have confirmed the result was produced. The
        # worker independently demands source-backed deliverables.
        if not _has_delivered_artifact(current):
            raise ValueError("No original deliverable is present")
        with self.lock:
            records = self._read(key)
            item = next((r for r in records if r["id"] == crystal_id), None)
            if not item or item["requestId"] != request_id or item["guestToken"] != token:
                raise ValueError("Crystal run changed before confirmation")
            current["_token"] = token
            _append(item, _snapshot(current))
            item["updatedAt"] = _now()
            self._save(key, records)
            return _summary(item)

    def advance_once(self, now=None):
        """On the already-running persistent worker; never uses browser timers."""
        timestamp = now if isinstance(now, (float, int)) else datetime.now(timezone.utc).timestamp()
        report = {"scanned": 0, "queued": 0, "skipped": 0, "failures": 0}
        if os.getenv("ASCENSION_ENABLE_CRYSTAL_EVOLUTION") == "false":
            return report
        with self.lock:
            for file in sorted(self.root.glob("*.json")):
                if report["queued"] >= _MAX_QUEUED_PER_CYCLE:
                    break
                # Skip malformed/foreign names without reading adjacent files.
                if not re.fullmatch(r"[a-f0-9]{64}\.json", file.name):
                    continue
                records = json.loads(file.read_text(encoding="utf-8"))
                if not isinstance(records, list):
                    report["failures"] += 1
                    continue
                dirty = False
                for item in records:
                    if report["queued"] >= _MAX_QUEUED_PER_CYCLE:
                        break
                    report["scanned"] += 1
                    try:
                        bundle = self._authorized_bundle(item["requestId"], item["guestToken"])
                        run = bundle["run"]
                        if (not _governed_persisted(run) or not _has_delivered_artifact(bundle)
                                or timestamp - _seconds(run.get("completed_at")) < _MIN_GROWTH_INTERVAL
                                or timestamp - _seconds(item.get("lastAutoQueuedAt")) < _MIN_GROWTH_INTERVAL):
                            report["skipped"] += 1
                            continue
                        original = item["intent"][:2000]
                        context = json.dumps({
                            "source": "ASCENSION_AUTONOMOUS_INTENT_CONTINUATION",
                            "crystal_id": item["id"], "original_intent": original,
                            "parent_request_id": item["requestId"],
                            "approval_boundary": "PRESERVE_ORIGINAL_SPEC",
                        }, separators=(",", ":"))[:2000]
                        objective = (
                            "Continue developing this original intent without changing the approved design. "
                            "Investigate one evidence-grounded connection, testable implication or limitation. "
                            "Clearly distinguish suggestions from verified findings. "
                            "Do not perform physical actions or change approved specifications. "
                            "Original continuing intent: " + original
                        )[:4000]
                        submitted = self.transport.submit({
                            "objective": objective, "evidence": [context], "constraints": None,
                            "parentRequestId": item["requestId"],
                            "parentGuestToken": item["guestToken"], "followUp": "continue",
                        })
                        bundle["_token"] = item["guestToken"]
                        _append(item, _snapshot(bundle))
                        item["requestId"] = submitted["request"]["id"]
                        item["guestToken"] = submitted["guestToken"]
                        item["lastAutoQueuedAt"] = _now()
                        item["updatedAt"] = item["lastAutoQueuedAt"]
                        dirty = True
                        report["queued"] += 1
                    except (ValueError, TypeError, KeyError, OSError):
                        report["failures"] += 1
                if dirty:
                    # This key is not stored: use the known valid SHA-256-derived
                    # filename within the authenticated worker storage directory.
                    _atomic_json(file, records)
        return report
