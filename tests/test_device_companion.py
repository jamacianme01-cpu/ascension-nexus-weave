import importlib.util
import json
import os
import sqlite3
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "ascension-device-companion.py"
spec = importlib.util.spec_from_file_location("ascension_device_companion_tested", SOURCE)
device = importlib.util.module_from_spec(spec)
spec.loader.exec_module(device)

CARD = "a" * 64
CRYSTAL = "11111111-1111-4111-8111-111111111111"


class DeviceCompanionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="ascension-device-test-")
        self.ledger = device.LocalKnowledgeverse(Path(self.directory.name) / "knowledgeverse.sqlite3")

    def tearDown(self):
        self.ledger.close()
        self.directory.cleanup()

    def _submit(self, instruction="Develop my idea"):
        return self.ledger.submit({
            "libraryKey": CARD,
            "crystalId": CRYSTAL,
            "intent": "Build my original user-owned engine without modifying the owner's design.",
            "instruction": instruction,
        })

    def test_intent_stored_and_never_implicitly_verified(self):
        first = self._submit()
        self.assertEqual(first["status"], "queued")
        self.assertEqual(len(self.ledger.library({"libraryKey": CARD})["crystals"]), 1)
        claimed = self.ledger.claim()
        self.assertEqual(claimed["id"], first["jobId"])
        self.ledger.complete(claimed["id"], "installed-model", "Unverified local draft")
        result = self.ledger.library({"libraryKey": CARD})["crystals"][0]
        self.assertEqual(result["intent"], "Build my original user-owned engine without modifying the owner's design.")
        self.assertEqual(result["jobs"][0]["status"], "completed")
        self.assertEqual(result["jobs"][0]["result"], "Unverified local draft")
        self.assertNotIn("verifiedRevision", result)
        self.assertEqual(len(result["jobs"]), 1)

    def test_bound_background_growth_keeps_same_intent(self):
        self._submit()
        first = self.ledger.claim()
        self.ledger.complete(first["id"], "installed-model", "An on-device draft to develop further")
        with self.ledger.lock, self.ledger.db:
            self.ledger.db.execute(
                "UPDATE crystals SET last_queued_at='2020-01-01T00:00:00Z' WHERE id=?", (CRYSTAL,))
        self.assertEqual(self.ledger.maybe_queue_growth(), 1)
        self.assertEqual(self.ledger.maybe_queue_growth(), 0, "Do not queue repeated background runs")
        jobs = self.ledger.library({"libraryKey": CARD})["crystals"][0]["jobs"]
        self.assertEqual(len(jobs), 2)
        self.assertEqual(jobs[-1]["status"], "queued")
        follow = self.ledger.claim()
        self.assertIn("Original intent:", follow["instruction"])
        self.assertIn("Build my original user-owned engine", follow["instruction"])
        self.assertIn("DO NOT claim verification", follow["instruction"])
        self.assertTrue(follow["id"] != first["id"])

    def test_owner_manual_follow_up_preserves_original_intent(self):
        self._submit()
        first = self.ledger.claim()
        self.ledger.complete(first["id"], "installed-model", "Earlier draft with component notes")
        second = self._submit("continue this intent")
        self.assertNotEqual(first["id"], second["jobId"])
        follow = self.ledger.claim()
        self.assertIn("Original owner intent (preserve its meaning):", follow["instruction"])
        self.assertIn("Build my original user-owned engine", follow["instruction"])
        self.assertIn("Owner follow-up instruction: continue this intent", follow["instruction"])
        self.assertIn("Earlier draft with component notes", follow["instruction"])

    def test_background_growth_requires_completed_real_draft(self):
        self._submit()
        with self.ledger.lock, self.ledger.db:
            self.ledger.db.execute("UPDATE crystals SET last_queued_at='2020-01-01T00:00:00Z'")
        self.assertEqual(self.ledger.maybe_queue_growth(), 0)
        first = self.ledger.claim()
        self.ledger.fail(first["id"], "Local model not installed")
        self.assertEqual(self.ledger.maybe_queue_growth(), 0)
        jobs = self.ledger.library({"libraryKey": CARD})["crystals"][0]["jobs"]
        self.assertEqual(jobs[0]["status"], "blocked")

    def test_storage_is_partitioned_by_library_card(self):
        self._submit()
        self.assertEqual(self.ledger.library({"libraryKey": "b" * 64})["crystals"], [])
        with self.assertRaisesRegex(ValueError, "Library Card"):
            self.ledger.library({"libraryKey": "not-a-key"})
        with self.assertRaisesRegex(ValueError, "original intent"):
            self.ledger.submit({
                "libraryKey": CARD, "crystalId": CRYSTAL,
                "intent": "different", "instruction": "change it",
            })

    def test_remote_model_url_rejected_without_network(self):
        with patch.dict(os.environ, {"ASCENSION_DEVICE_MODEL_URL": "https://remote.example/api"}):
            with self.assertRaisesRegex(RuntimeError, "local loopback"):
                device.local_model()

    def test_background_worker_persists_result_after_browser_is_closed(self):
        # Simulate a real installed model; no external model/API is contacted.
        submitted = self._submit()
        stop = device.threading.Event()
        with patch.object(device, "generate_local",
                          return_value=("installed-local-model", "Model-produced draft")):
            thread = device.threading.Thread(target=device.work_forever,
                                             args=(self.ledger, stop), daemon=True)
            thread.start()
            try:
                deadline = time.time() + 3
                while time.time() < deadline:
                    jobs = self.ledger.library({"libraryKey": CARD})["crystals"][0]["jobs"]
                    if jobs and jobs[0]["status"] == "completed":
                        break
                    time.sleep(0.02)
                self.assertEqual(jobs[0]["status"], "completed")
            finally:
                stop.set()
                thread.join(timeout=2)
        self.ledger.close()
        self.ledger = device.LocalKnowledgeverse(Path(self.directory.name) / "knowledgeverse.sqlite3")
        restored = self.ledger.library({"libraryKey": CARD})["crystals"][0]["jobs"]
        self.assertEqual(restored[0]["id"], submitted["jobId"])
        self.assertEqual(restored[0]["result"], "Model-produced draft")
        self.assertEqual(restored[0]["model"], "installed-local-model")
        self.assertNotIn("verified", restored[0]["status"])

    def test_finished_sqlite_history_exports_and_restores_additively(self):
        first = self._submit()
        run = self.ledger.claim()
        self.ledger.complete(run["id"], "my-installed-local-model", "Finished work created with the browser closed")
        second = self._submit("Develop one alternative")
        blocked = self.ledger.claim()
        self.ledger.fail(blocked["id"], "Local model was offline")
        snapshot = self.ledger.snapshot({"libraryKey": CARD})
        self.assertEqual(snapshot["format"], "ascension-companion-finished-history")
        self.assertEqual(snapshot["version"], 1)
        self.assertNotIn("libraryKey", repr(snapshot))
        self.assertEqual(len(snapshot["crystals"]), 1)
        self.assertEqual(len(snapshot["crystals"][0]["jobs"]), 2)
        target = device.LocalKnowledgeverse(Path(self.directory.name) / "recovered.sqlite3")
        new_card = "b" * 64
        try:
            restored = target.restore_snapshot({"libraryKey": new_card, "snapshot": snapshot})
            self.assertEqual(restored["importedCrystals"], 1)
            self.assertEqual(restored["importedJobs"], 2)
            self.assertEqual(restored["skippedJobs"], 0)
            jobs = target.library({"libraryKey": new_card})["crystals"][0]["jobs"]
            self.assertEqual(jobs[0]["result"], "Finished work created with the browser closed")
            self.assertEqual(jobs[0]["status"], "completed")
            self.assertEqual(jobs[1]["status"], "blocked")
            self.assertEqual(target.library({"libraryKey": CARD})["crystals"], [])
            self.assertEqual(target.maybe_queue_growth(), 0, "Restored old history cannot queue itself")
            again = target.restore_snapshot({"libraryKey": new_card, "snapshot": snapshot})
            self.assertEqual(again["importedCrystals"], 0)
            self.assertEqual(again["importedJobs"], 0)
            self.assertEqual(again["skippedJobs"], 2)
            self.assertEqual(len(target.library({"libraryKey": new_card})["crystals"][0]["jobs"]), 2)
        finally:
            target.close()

    def test_tampered_or_conflicting_sqlite_snapshot_is_atomic(self):
        submitted = self._submit()
        claimed = self.ledger.claim()
        self.ledger.complete(claimed["id"], "local-model", "Owner's finished work")
        source = self.ledger.snapshot({"libraryKey": CARD})
        destination = device.LocalKnowledgeverse(Path(self.directory.name) / "new-owner.sqlite3")
        new_card = "b" * 64
        try:
            altered = json.loads(json.dumps(source))
            altered["crystals"][0]["jobs"][0]["status"] = "verified"
            with self.assertRaisesRegex(ValueError, "Malformed"):
                destination.restore_snapshot({"libraryKey": new_card, "snapshot": altered})
            self.assertEqual(destination.library({"libraryKey": new_card})["crystals"], [])

            copied = json.loads(json.dumps(source))
            copied["crystals"][0]["intent"] = "An unauthorized replacement for the owner intent"
            destination.restore_snapshot({"libraryKey": new_card, "snapshot": copied})
            before = destination.library({"libraryKey": new_card})["crystals"][0]["intent"]
            with self.assertRaisesRegex(ValueError, "conflicts"):
                destination.restore_snapshot({"libraryKey": new_card, "snapshot": source})
            self.assertEqual(destination.library({"libraryKey": new_card})["crystals"][0]["intent"], before)
            self.assertEqual(len(destination.library({"libraryKey": new_card})["crystals"][0]["jobs"]), 1)
        finally:
            destination.close()

    def test_pending_jobs_are_not_exported_as_active_background_work(self):
        self._submit()
        snapshot = self.ledger.snapshot({"libraryKey": CARD})
        self.assertEqual(snapshot["crystals"][0]["jobs"], [])
        recovered = device.LocalKnowledgeverse(Path(self.directory.name) / "pending-recovered.sqlite3")
        try:
            recovered.restore_snapshot({"libraryKey": "b" * 64, "snapshot": snapshot})
            self.assertEqual(recovered.library({"libraryKey": "b" * 64})["crystals"][0]["jobs"], [])
        finally:
            recovered.close()

    def test_auto_growth_can_be_disabled(self):
        self._submit()
        first = self.ledger.claim()
        self.ledger.complete(first["id"], "installed-model", "A real local draft")
        with self.ledger.lock, self.ledger.db:
            self.ledger.db.execute("UPDATE crystals SET last_queued_at='2020-01-01T00:00:00Z'")
        with patch.dict(os.environ, {"ASCENSION_DEVICE_AUTOGROW": "false"}):
            self.assertEqual(self.ledger.maybe_queue_growth(), 0)


if __name__ == "__main__":
    unittest.main()
