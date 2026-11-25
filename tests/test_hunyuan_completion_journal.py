"""Offline regression: generated GLB receipts survive a lost queue acknowledgment."""
from __future__ import annotations
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runtime_bridge"))
import hunyuan_model_worker as worker


class CompletionJournalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, {"ASCENSION_MODEL_JOURNAL_DIR": self.temp.name})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.job_id = str(uuid.uuid4())

    def test_pending_completion_replays_without_rebuilding(self):
        worker._save_pending_completion(self.job_id)
        self.assertTrue(worker._pending_file(self.job_id).exists())
        with patch.object(worker, "_report", return_value={"ok": True}) as report:
            pending = worker._drain_pending_completions("https://example.invalid/queue", "test-token")
        self.assertFalse(pending)
        self.assertFalse(worker._pending_file(self.job_id).exists())
        report.assert_called_once_with(
            "https://example.invalid/queue", "test-token", self.job_id, "completed")

    def test_transient_completion_retry_keeps_original_job(self):
        attempts = [RuntimeError("queue HTTP 503"), RuntimeError("queue HTTP 500"), {"ok": True}]
        with patch.object(worker, "_report", side_effect=attempts) as report, patch.object(worker.time, "sleep") as sleeper:
            result = worker._report_completed_with_retry("https://example.invalid/queue", "token", self.job_id)
        self.assertTrue(result["ok"])
        self.assertEqual(report.call_count, 3)
        self.assertEqual(sleeper.call_count, 2)

    def test_successful_upload_never_becomes_failed_when_report_is_lost(self):
        job = {"id": self.job_id, "label": "approved-source",
               "source_image_url": "https://example.invalid/original.png",
               "upload_url": "https://example.invalid/upload"}
        statuses = []
        def fake_report(_url, _token, _job_id, status, error=None):
            statuses.append(status)
            if status == "completed":
                raise RuntimeError("queue HTTP 500")
            return {"ok": True}
        with (patch.object(worker, "_json_request", return_value={"item": job}),
              patch.object(worker, "_download_source_image", return_value=Path(self.temp.name) / "source.png"),
              patch.object(worker, "_generate_glb", return_value=b"glTF" + b"0" * 32),
              patch.object(worker, "_upload_glb") as upload,
              patch.object(worker, "_report", side_effect=fake_report),
              patch.object(worker.time, "sleep")):
            result = worker.run_once("https://example.invalid/queue", "http://127.0.0.1:8081/generate",
                                     "test-token", "test-runner")
        self.assertFalse(result)
        upload.assert_called_once()
        self.assertEqual(statuses.count("failed"), 0)
        self.assertTrue(worker._pending_file(self.job_id).exists())
        with patch.object(worker, "_report", return_value={"ok": True}):
            self.assertFalse(worker._drain_pending_completions("https://example.invalid/queue", "test-token"))
        self.assertFalse(worker._pending_file(self.job_id).exists())

    def test_invalid_job_id_cannot_write_a_journal_path(self):
        with self.assertRaises(ValueError):
            worker._save_pending_completion("../private")
        self.assertEqual(list(Path(self.temp.name).glob("*")), [])


if __name__ == "__main__":
    unittest.main()
