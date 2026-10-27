"""Tests for the paired hub's observation relay and non-destructive mode."""
import importlib.util
import io
import json
import os
from pathlib import Path
from unittest import TestCase, mock
from urllib.error import HTTPError

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ascension_hub_worker.py"
spec = importlib.util.spec_from_file_location("ascension_hub_worker", SCRIPT)
hub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hub)


class FakeResponse:
    def __init__(self, text, status=200):
        self.text = text
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self):
        return self.text.encode("utf-8")


class HubObservationTests(TestCase):
    def test_local_503_is_preserved_verbatim(self):
        body = '{"schema_version":"ascension.observation.v1","availability":"unavailable"}'
        error = HTTPError("http://localhost:8765", 503, "unavailable", {}, io.BytesIO(body.encode()))
        with mock.patch.object(hub, "urlopen", side_effect=error):
            result = hub.observe("http://localhost:8765", "/chamber")
        self.assertEqual(result, {"status": 503, "text": body})

    def test_local_other_error_identifies_surface(self):
        error = HTTPError("http://localhost:8765", 401, "unauthorized", {}, io.BytesIO(b""))
        with mock.patch.object(hub, "urlopen", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "/status returned HTTP 401"):
                hub.observe("http://localhost:8765", "/status")

    def test_optional_503_does_not_block_verified_snapshot(self):
        snapshot = json.dumps({
            "availability": "available",
            "snapshot_hash": "sha256:verified-by-gateway",
            "content": {
                "snapshot_revision": 125,
                "publication_provenance": {"source_classification": "LIVE_GOVERNED"},
                "knowledge_forms": [],
            },
        })
        def observe(_base, path):
            if path == "/snapshot":
                return {"text": snapshot, "status": 200}
            if path == "/chamber":
                return {"text": '{"availability":"unavailable"}', "status": 503}
            return {"text": '{"availability":"available"}', "status": 200}

        def urlopen(req, timeout):
            if hasattr(req, "data") and req.data is not None:
                doc = json.loads(req.data)
                self.assertEqual(doc["documents"]["/chamber"]["status"], 503)
                self.assertEqual(doc["documents"]["/snapshot"]["text"], snapshot)
                self.assertNotIn("key", doc)
                return FakeResponse('{"ok":true}')
            return FakeResponse(snapshot)

        with mock.patch.object(hub, "observe", side_effect=observe), \
             mock.patch.object(hub, "urlopen", side_effect=urlopen):
            self.assertEqual(hub.relay_observations("http://localhost:8765", "a" * 96), 125)

    def test_snapshot_503_blocks_push(self):
        with mock.patch.object(hub, "observe", return_value={"status": 503, "text": "{}"}), \
             mock.patch.object(hub, "urlopen") as remote:
            with self.assertRaisesRegex(RuntimeError, "/snapshot is unavailable"):
                hub.relay_observations("http://localhost:8765", "a" * 96)
            remote.assert_not_called()

    def test_observations_only_does_not_import_core_or_claim_queue(self):
        with mock.patch.dict(os.environ, {"ASCENSION_HUB_KEY": "a" * 96}), \
             mock.patch("sys.argv", ["ascension_hub_worker.py", "--root", "C:/unused", "--once", "--observations-only"]), \
             mock.patch.object(hub, "relay_observations", return_value=125) as relay:
            self.assertEqual(hub.main(), 0)
            relay.assert_called_once()

    def test_observations_only_reports_failure(self):
        with mock.patch.dict(os.environ, {"ASCENSION_HUB_KEY": "a" * 96}), \
             mock.patch("sys.argv", ["ascension_hub_worker.py", "--root", "C:/unused", "--once", "--observations-only"]), \
             mock.patch.object(hub, "relay_observations", side_effect=RuntimeError("local offline")):
            self.assertEqual(hub.main(), 1)
