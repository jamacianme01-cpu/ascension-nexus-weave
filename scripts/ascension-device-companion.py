#!/usr/bin/env python3
"""ASCENSION user's own computer: local SQLite + locally installed model.

No ASCENSION central database, cloud API, paid model, Fly transport, or old-PC
connection. This is an OPTIONAL same-device companion for continued work when
the browser is closed. It never calls a hosted model and never marks AI drafts
as verified. Python standard library only. Keep this process running for
background work; mobile operating systems may prevent such execution.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

PORT = 8788
ALLOWED_ORIGINS = {
    "http://localhost:4174", "http://127.0.0.1:4174",
    "http://localhost:8080", "http://127.0.0.1:8080",
}
CARD_RE = re.compile(r"^[a-f0-9]{64}$")
UUID_RE = re.compile(r"^[a-f0-9-]{36}$")
INTERVAL = 12 * 60 * 60
MAX_QUEUED_AUTOMATIC = 2
MAX_JSON = 65536
MAX_DRAFT = 50000
MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024
MAX_SNAPSHOT_JOBS = 4096


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def timestamp(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return 0.0


def valid_card(value: object) -> str:
    if not isinstance(value, str) or not CARD_RE.fullmatch(value):
        raise ValueError("Valid device Library Card capability is required")
    return value


def valid_uuid(value: object) -> str:
    if not isinstance(value, str) or not UUID_RE.fullmatch(value):
        raise ValueError("Valid intent or job identifier is required")
    parsed = str(uuid.UUID(value))
    if parsed != value:
        raise ValueError("Canonical UUID required")
    return parsed


class LocalKnowledgeverse:
    def __init__(self, location: Path):
        self.path = location.expanduser().resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.path.parent, 0o700)
        # SQLite and its WAL files must not inherit world-readable defaults.
        old_umask = os.umask(0o077)
        try:
            self.db = sqlite3.connect(str(self.path), check_same_thread=False, timeout=15)
        finally:
            os.umask(old_umask)
        os.chmod(self.path, 0o600)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA busy_timeout=15000")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS crystals (
            id TEXT NOT NULL,
            card_id TEXT NOT NULL,
            intent TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_queued_at TEXT,
            PRIMARY KEY (card_id, id)
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            card_id TEXT NOT NULL,
            crystal_id TEXT NOT NULL,
            instruction TEXT NOT NULL,
            status TEXT NOT NULL,
            model TEXT,
            result TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            finished_at TEXT
        );
        CREATE INDEX IF NOT EXISTS jobs_card_crystal
            ON jobs(card_id, crystal_id, created_at);
        """)
        # Recover interrupted runs; never declare them complete on restart.
        self.db.execute("UPDATE jobs SET status='queued' WHERE status='running'")
        self.db.commit()

    def submit(self, payload: dict) -> dict:
        card_id = valid_card(payload.get("libraryKey"))
        crystal_id = valid_uuid(payload.get("crystalId"))
        intent = payload.get("intent")
        instruction = payload.get("instruction")
        if (not isinstance(intent, str) or not intent.strip() or len(intent) > 4000
                or not isinstance(instruction, str) or not instruction.strip() or len(instruction) > 4000):
            raise ValueError("An original intent and instruction are required")
        with self.lock, self.db:
            existing = self.db.execute(
                "SELECT intent FROM crystals WHERE card_id=? AND id=?", (card_id, crystal_id)
            ).fetchone()
            if existing and existing["intent"] != intent:
                raise ValueError("An existing crystal's original intent cannot be replaced")
            if not existing:
                count = self.db.execute("SELECT count(*) AS n FROM crystals WHERE card_id=?",
                                        (card_id,)).fetchone()["n"]
                if count >= 128:
                    raise ValueError("Library Card crystal limit reached")
                now = utc_now()
                self.db.execute(
                    "INSERT INTO crystals(id,card_id,intent,created_at,updated_at) VALUES(?,?,?,?,?)",
                    (crystal_id, card_id, intent, now, now))
            pending = self.db.execute("""
                SELECT id FROM jobs WHERE card_id=? AND crystal_id=?
                AND status IN ('queued','running')
                LIMIT 1
                """, (card_id, crystal_id)).fetchone()
            if pending:
                return {"jobId": pending["id"], "status": "queued"}
            # A manual continuation MUST have the exact original owner intent,
            # not only a context-free phrase such as "continue this intent".
            latest = self.db.execute("""
                SELECT result FROM jobs WHERE card_id=? AND crystal_id=?
                AND status='completed' ORDER BY created_at DESC LIMIT 1
            """, (card_id, crystal_id)).fetchone()
            contextual = (
                "Original owner intent (preserve its meaning): " + intent.strip()
                + "\nOwner follow-up instruction: " + instruction.strip()
                + ("\nPrevious unverified local draft (context, not proof): "
                   + latest["result"][:1500]
                   if latest and isinstance(latest["result"], str) else "")
            )[:4000]
            job_id = str(uuid.uuid4())
            now = utc_now()
            self.db.execute("""
                INSERT INTO jobs(id,card_id,crystal_id,instruction,status,created_at)
                VALUES(?,?,?,?,'queued',?)
                """, (job_id, card_id, crystal_id, contextual, now))
            self.db.execute("""
                UPDATE crystals SET last_queued_at=?, updated_at=?
                WHERE card_id=? AND id=?
                """, (now, now, card_id, crystal_id))
            return {"jobId": job_id, "status": "queued"}

    def library(self, payload: dict) -> dict:
        card = valid_card(payload.get("libraryKey"))
        with self.lock:
            crystals = [dict(row) for row in self.db.execute(
                "SELECT * FROM crystals WHERE card_id=? ORDER BY created_at", (card,))]
            jobs = [dict(row) for row in self.db.execute(
                "SELECT id,crystal_id,status,model,result,error,created_at,finished_at "
                "FROM jobs WHERE card_id=? ORDER BY created_at", (card,))]
        grouped = {}
        for job in jobs:
            grouped.setdefault(job["crystal_id"], []).append(job)
        return {"crystals": [{
            "id": item["id"], "intent": item["intent"], "createdAt": item["created_at"],
            "updatedAt": item["updated_at"], "jobs": grouped.get(item["id"], [])[-64:],
        } for item in crystals]}

    def snapshot(self, payload: dict) -> dict:
        """All finished local jobs on this Library Card; no keys or pending jobs."""
        card = valid_card(payload.get("libraryKey"))
        with self.lock:
            crystals = [dict(row) for row in self.db.execute("""
                SELECT id, intent, created_at, updated_at FROM crystals
                WHERE card_id=? ORDER BY created_at
            """, (card,))]
            finished = [dict(row) for row in self.db.execute("""
                SELECT id, crystal_id, instruction, status, model, result, error,
                       created_at, finished_at
                FROM jobs WHERE card_id=? AND status IN ('completed','blocked')
                ORDER BY created_at
            """, (card,))]
        if len(finished) > MAX_SNAPSHOT_JOBS:
            raise ValueError("Companion history exceeds the secure archive job limit")
        by_crystal = {}
        for job in finished:
            by_crystal.setdefault(job.pop("crystal_id"), []).append(job)
        result = {
            "format": "ascension-companion-finished-history",
            "version": 1,
            "crystals": [{
                "id": entry["id"], "intent": entry["intent"],
                "createdAt": entry["created_at"], "updatedAt": entry["updated_at"],
                "jobs": by_crystal.get(entry["id"], []),
            } for entry in crystals],
        }
        if len(json.dumps(result, separators=(",", ":")).encode("utf-8")) > MAX_SNAPSHOT_BYTES:
            raise ValueError("Companion history is too large for one encrypted archive")
        return result

    def restore_snapshot(self, payload: dict) -> dict:
        """Add missing finished jobs only; never overwrite originals or resume jobs."""
        card = valid_card(payload.get("libraryKey"))
        snapshot = payload.get("snapshot")
        if (not isinstance(snapshot, dict) or
            snapshot.get("format") != "ascension-companion-finished-history" or
            snapshot.get("version") != 1):
            raise ValueError("Invalid companion backup structure")
        data = snapshot.get("crystals")
        if not isinstance(data, list) or len(data) > 128:
            raise ValueError("Invalid companion backup crystal count")
        if len(json.dumps(snapshot, separators=(",", ":")).encode("utf-8")) > MAX_SNAPSHOT_BYTES:
            raise ValueError("Companion backup exceeds allowed size")
        prepared = []
        seen_crystals = set()
        seen_jobs = set()
        job_count = 0
        for record in data:
            if not isinstance(record, dict):
                raise ValueError("Invalid companion backup crystal")
            crystal_id = valid_uuid(record.get("id"))
            intent = record.get("intent")
            if crystal_id in seen_crystals or not isinstance(intent, str) or not 1 <= len(intent.strip()) <= 4000:
                raise ValueError("Duplicate or invalid original intent")
            seen_crystals.add(crystal_id)
            created = record.get("createdAt")
            updated = record.get("updatedAt")
            if not isinstance(created, str) or not timestamp(created) or not isinstance(updated, str) or not timestamp(updated):
                raise ValueError("Invalid original timestamp")
            jobs = record.get("jobs")
            if not isinstance(jobs, list):
                raise ValueError("Invalid companion job history")
            accepted = []
            for job in jobs:
                if not isinstance(job, dict):
                    raise ValueError("Invalid companion job")
                job_id = valid_uuid(job.get("id"))
                status = job.get("status")
                instruction = job.get("instruction")
                model = job.get("model")
                result = job.get("result")
                error = job.get("error")
                created_at = job.get("created_at")
                finished_at = job.get("finished_at")
                if (job_id in seen_jobs or status not in ("completed", "blocked") or
                    not isinstance(instruction, str) or not 1 <= len(instruction) <= 4000 or
                    not isinstance(created_at, str) or not timestamp(created_at) or
                    not isinstance(finished_at, str) or not timestamp(finished_at) or
                    error is not None and (not isinstance(error, str) or len(error) > 400)):
                    raise ValueError("Malformed or duplicate archived job")
                if status == "completed" and (
                    not isinstance(model, str) or not 1 <= len(model) <= 300 or
                    not isinstance(result, str) or not 1 <= len(result) <= MAX_DRAFT
                ):
                    raise ValueError("An archived local draft is incomplete")
                if status == "blocked" and (
                    model is not None and not isinstance(model, str) or
                    result is not None and not isinstance(result, str)
                ):
                    raise ValueError("Invalid blocked job")
                seen_jobs.add(job_id)
                job_count += 1
                if job_count > MAX_SNAPSHOT_JOBS:
                    raise ValueError("Too many companion jobs to import")
                accepted.append((job_id, crystal_id, instruction, status, model, result,
                                 error, created_at, finished_at))
            prepared.append((crystal_id, intent, created, updated, accepted))
        inserted_crystals = 0
        inserted_jobs = 0
        with self.lock, self.db:
            own = {row["id"]: row["intent"] for row in self.db.execute(
                "SELECT id,intent FROM crystals WHERE card_id=?", (card,))}
            if len(own) + sum(1 for entry in prepared if entry[0] not in own) > 128:
                raise ValueError("The import would exceed the Library Card crystal limit")
            # Check every conflict BEFORE any write, so a failed restore cannot
            # overwrite or partially replace the owner's local discoveries.
            for crystal_id, intent, _, _, jobs in prepared:
                if crystal_id in own and own[crystal_id] != intent:
                    raise ValueError("Archived intent conflicts with current owner original")
                for job in jobs:
                    match = self.db.execute("SELECT card_id,crystal_id FROM jobs WHERE id=?",
                                            (job[0],)).fetchone()
                    if match and (match["card_id"] != card or match["crystal_id"] != crystal_id):
                        raise ValueError("Archived job identifier conflicts with existing owner data")
            for crystal_id, intent, created, updated, jobs in prepared:
                if crystal_id not in own:
                    # A restored old job cannot automatically start a new run.
                    self.db.execute("""
                        INSERT INTO crystals(id,card_id,intent,created_at,updated_at,last_queued_at)
                        VALUES(?,?,?,?,?,?)
                    """, (crystal_id, card, intent, created, updated, utc_now()))
                    inserted_crystals += 1
                for job in jobs:
                    cursor = self.db.execute("""
                        INSERT OR IGNORE INTO jobs
                        (id,card_id,crystal_id,instruction,status,model,result,error,created_at,finished_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?)
                    """, (job[0], card, *job[1:]))
                    inserted_jobs += cursor.rowcount
        return {"importedCrystals": inserted_crystals,
                "importedJobs": inserted_jobs,
                "skippedJobs": job_count - inserted_jobs}

    def maybe_queue_growth(self) -> int:
        if os.environ.get("ASCENSION_DEVICE_AUTOGROW", "true").lower() == "false":
            return 0
        now = time.time()
        queued = 0
        with self.lock, self.db:
            crystals = self.db.execute("SELECT * FROM crystals ORDER BY last_queued_at").fetchall()
            for item in crystals:
                if queued >= MAX_QUEUED_AUTOMATIC:
                    break
                if now - timestamp(item["last_queued_at"]) < INTERVAL:
                    continue
                last = self.db.execute("""
                    SELECT * FROM jobs WHERE card_id=? AND crystal_id=?
                    ORDER BY created_at DESC LIMIT 1
                    """, (item["card_id"], item["id"])).fetchone()
                if not last or last["status"] != "completed" or not last["result"]:
                    continue
                instruction = (
                    "Continue exploring the same original intent. Investigate a DIFFERENT "
                    "testable implication, limitation, connection or alternative. "
                    "Keep approved design decisions unchanged, identify uncertainty, "
                    "and DO NOT claim verification or physical testing. "
                    "Original intent: " + item["intent"]
                    + "\nPrevious unverified draft:\n" + last["result"][:2000]
                )[:4000]
                job_id = str(uuid.uuid4())
                now_text = utc_now()
                self.db.execute("""
                    INSERT INTO jobs(id,card_id,crystal_id,instruction,status,created_at)
                    VALUES(?,?,?,?,'queued',?)
                """, (job_id, item["card_id"], item["id"], instruction, now_text))
                self.db.execute("""
                    UPDATE crystals SET last_queued_at=?,updated_at=? WHERE card_id=? AND id=?
                """, (now_text, now_text, item["card_id"], item["id"]))
                queued += 1
        return queued

    def claim(self):
        with self.lock, self.db:
            row = self.db.execute("""
                SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1
            """).fetchone()
            if row:
                self.db.execute("UPDATE jobs SET status='running' WHERE id=?", (row["id"],))
                return dict(row)
        return None

    def complete(self, job_id: str, model: str, result: str):
        with self.lock, self.db:
            self.db.execute("""
                UPDATE jobs SET status='completed', model=?, result=?, error=NULL,
                finished_at=? WHERE id=? AND status='running'
            """, (model, result, utc_now(), job_id))

    def fail(self, job_id: str, message: str):
        with self.lock, self.db:
            self.db.execute("""
                UPDATE jobs SET status='blocked', error=?,finished_at=?
                WHERE id=? AND status='running'
            """, (message[:400], utc_now(), job_id))

    def close(self):
        with self.lock:
            self.db.close()


def local_model() -> tuple[str, str]:
    """Select an actually installed Ollama model on this computer only."""
    base = os.environ.get("ASCENSION_DEVICE_MODEL_URL", "http://127.0.0.1:11434").rstrip("/")
    uri = urlparse(base)
    if uri.scheme != "http" or uri.hostname not in ("localhost", "127.0.0.1") or uri.username or uri.password:
        raise RuntimeError("The device AI engine must use local loopback only")
    try:
        with urlopen(Request(base + "/api/tags", headers={"Accept": "application/json"}), timeout=3) as response:
            manifest = json.loads(response.read(1024 * 1024))
    except (OSError, ValueError) as exc:
        raise RuntimeError("No locally running Ollama model was found on this device") from exc
    available = [m.get("name") for m in manifest.get("models", []) if isinstance(m, dict) and m.get("name")]
    selected = os.environ.get("ASCENSION_DEVICE_MODEL", "").strip()
    if not selected:
        if len(available) != 1:
            raise RuntimeError("Select ASCENSION_DEVICE_MODEL from installed device models")
        selected = available[0]
    if selected not in available:
        raise RuntimeError("The selected model is not installed on this device")
    return base, selected


def generate_local(job: dict) -> tuple[str, str]:
    base, model = local_model()
    prompt = [
        "You are assisting the owner of an ASCENSION intent crystal on their own device.",
        "Honor the ORIGINAL owner intent verbatim. Do not change approved designs.",
        "Return a useful, specific answer or development draft; distinguish unknowns.",
        "Your text is NOT verified, executed, tested or persisted as governed proof.",
        "Never claim autonomous physical testing, third-party research or completed fabrication.",
        "",
        job["instruction"],
    ]
    body = json.dumps({
        "model": model, "stream": False,
        "messages": [{"role": "user", "content": "\n".join(prompt)}],
        "options": {"temperature": 0.3},
    }).encode("utf-8")
    request = Request(base + "/api/chat", data=body, method="POST",
                      headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=180) as response:
            result = json.loads(response.read(1024 * 1024))
    except (HTTPError, URLError, ValueError, OSError) as exc:
        raise RuntimeError("The on-device model could not complete this draft") from exc
    content = result.get("message", {}).get("content", "")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("The on-device model returned no useful content")
    return model, content.strip()[:MAX_DRAFT]


def work_forever(storage: LocalKnowledgeverse, stop: threading.Event):
    # Background scheduling is bounded to two continuations every 30 minutes,
    # not two every 10 seconds or every time a model finishes a job.
    last_growth_scan = 0.0
    while not stop.is_set():
        try:
            now = time.monotonic()
            if now - last_growth_scan >= 1800:
                storage.maybe_queue_growth()
                last_growth_scan = now
            job = storage.claim()
            if job:
                try:
                    model, output = generate_local(job)
                    storage.complete(job["id"], model, output)
                except (RuntimeError, ValueError) as exc:
                    storage.fail(job["id"], str(exc))
                continue
        except Exception as exc:
            print("ASCENSION_DEVICE_CYCLE_FAILED " + type(exc).__name__, flush=True)
        stop.wait(10)



class BackgroundSyncManager:
    """Explicitly paired desktop process; secrets are piped to Node once in RAM.

    Never stores credentials, derives a server account, or selects a folder.
    The worker lives only while this local companion process remains alive.
    """

    def __init__(self):
        self.lock = threading.RLock()
        self.process = None
        self.card = None

    def start(self, request: dict) -> dict:
        card = valid_card(request.get("libraryKey"))
        directory = request.get("directory")
        passphrase = request.get("passphrase")
        browser_id = request.get("deviceId")
        marker = request.get("marker")
        token = request.get("token")
        if not isinstance(passphrase, str) or not 12 <= len(passphrase) <= 256:
            raise ValueError("A 12-256-character private passphrase is required")
        valid_uuid(browser_id)
        if not isinstance(directory, str) or not 1 <= len(directory) <= 1024:
            raise ValueError("Choose the absolute local shared-folder path")
        folder = Path(directory).expanduser()
        if not folder.is_absolute() or not folder.is_dir() or folder.is_symlink():
            raise ValueError("The chosen desktop folder must exist at an absolute path")
        if not isinstance(token, str) or not re.fullmatch(r"[0-9a-f-]{36}", token):
            raise ValueError("Missing private folder pairing proof")
        if marker != ".ascension-bg-pair-" + token + ".tmp":
            raise ValueError("Invalid owner-selected folder pairing proof")
        proof = folder / marker
        if proof.is_symlink() or not proof.is_file() or proof.stat().st_size > 100:
            raise ValueError("The browser's folder does not match the desktop folder path")
        if proof.read_text(encoding="utf-8") != token:
            raise ValueError("The browser's folder does not match the desktop folder path")
        node = shutil.which("node")
        worker = Path(__file__).resolve().with_name("ascension-background-sync.mjs")
        if not node or not worker.is_file():
            raise ValueError("The local Node.js background companion is unavailable")
        config = {
            "directory": str(folder.resolve()),
            "passphrase": passphrase,
            "libraryKey": card,
            "browserDeviceId": browser_id,
        }
        with self.lock:
            self._stop()
            process = subprocess.Popen(
                [node, str(worker)], stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                cwd=str(worker.parent.parent),
            )
            try:
                assert process.stdin is not None
                process.stdin.write(json.dumps(config).encode("utf-8"))
                process.stdin.close()
            except (BrokenPipeError, OSError):
                process.terminate()
                raise ValueError("Local background sync did not start")
            self.process = process
            self.card = card
        return {"active": True, "execution": "desktop_companion_while_running"}

    def stop(self, request: dict) -> dict:
        card = valid_card(request.get("libraryKey"))
        with self.lock:
            if self.card is not None and self.card != card:
                raise ValueError("Another Library Card owns the background exchange")
            self._stop()
        return {"active": False}

    def _stop(self):
        process = self.process
        self.process = None
        self.card = None
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=4)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=4)

    def shutdown(self):
        with self.lock:
            self._stop()


class DeviceHandler(BaseHTTPRequestHandler):
    server_version = "ASCENSION-Device-Knowledgeverse/1"

    def log_message(self, message, *args):
        # Do not log private user intents or identifiers.
        if os.environ.get("ASCENSION_DEVICE_DEBUG") == "true":
            super().log_message(message, *args)

    def _allowed(self) -> bool:
        host = self.headers.get("Host", "").split(":")[0]
        origin = self.headers.get("Origin")
        return host in ("localhost", "127.0.0.1") and (origin is None or origin in ALLOWED_ORIGINS)

    def _reply(self, code: int, payload: dict):
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        if not self._allowed():
            self._reply(403, {"error": "origin_not_allowed"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", ""))
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self):
        if not self._allowed():
            return self._reply(403, {"error": "origin_not_allowed"})
        if self.path == "/v1/health":
            return self._reply(200, {
                "status": "DEVICE_LIBRARY", "processing": "local-only",
                "autogrow": os.environ.get("ASCENSION_DEVICE_AUTOGROW", "true") != "false",
            })
        return self._reply(404, {"error": "not_found"})

    def do_POST(self):
        if not self._allowed():
            return self._reply(403, {"error": "origin_not_allowed"})
        if self.path in ("/v1/background-sync-start", "/v1/background-sync-stop") and self.headers.get("Origin") not in ALLOWED_ORIGINS:
            return self._reply(403, {"error": "owner_browser_origin_required"})
        try:
            request_limit = (MAX_SNAPSHOT_BYTES + 4096
                             if self.path == "/v1/restore-finished" else MAX_JSON)
            if int(self.headers.get("Content-Length", "0")) > request_limit:
                return self._reply(413, {"error": "request_too_large"})
            size = int(self.headers.get("Content-Length", "0"))
            if size < 2:
                return self._reply(400, {"error": "invalid_request"})
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError("JSON object required")
            if self.path == "/v1/library":
                payload = self.server.library.library(data)
            elif self.path == "/v1/submit":
                payload = self.server.library.submit(data)
            elif self.path == "/v1/snapshot":
                payload = self.server.library.snapshot(data)
            elif self.path == "/v1/restore-finished":
                payload = self.server.library.restore_snapshot(data)
            elif self.path == "/v1/background-sync-start":
                payload = self.server.background_sync.start(data)
            elif self.path == "/v1/background-sync-stop":
                payload = self.server.background_sync.stop(data)
            else:
                return self._reply(404, {"error": "not_found"})
            return self._reply(200, payload)
        except (ValueError, TypeError) as exc:
            return self._reply(400, {"error": str(exc)[:150]})
        except Exception as exc:
            print("ASCENSION_DEVICE_ERROR " + type(exc).__name__, flush=True)
            return self._reply(500, {"error": "device_storage_error"})


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    import argparse
    parser = argparse.ArgumentParser(description="ASCENSION user-owned on-device intelligence")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--storage", default=str(Path.home() / ".ascension" / "knowledgeverse.sqlite3"))
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        raise SystemExit("Invalid device service port")
    # No network/public binding accepted.
    library = LocalKnowledgeverse(Path(args.storage))
    stop = threading.Event()
    thread = threading.Thread(target=work_forever, args=(library, stop), daemon=True)
    server = LocalServer(("127.0.0.1", args.port), DeviceHandler)
    server.library = library
    server.background_sync = BackgroundSyncManager()
    thread.start()
    print("ASCENSION_DEVICE_COMPANION_LOCAL_ONLY " + str(library.path), flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        stop.set()
        server.background_sync.shutdown()
        thread.join(timeout=2)
        library.close()


if __name__ == "__main__":
    main()
