"""Desktop owner-consent and lifecycle tests; no real process or user folder touched."""
import importlib.util
import io
import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "ascension-device-companion.py"
spec = importlib.util.spec_from_file_location("device_companion_background_tested", SOURCE)
device = importlib.util.module_from_spec(spec)
spec.loader.exec_module(device)

CARD = "a" * 64
DEVICE_ID = "11111111-1111-4111-8111-111111111111"
PASS = "user-private-long-passphrase"

class CaptureStream(io.BytesIO):
    def close(self):
        self.saved = self.getvalue()
        super().close()

class FakeWorker:
    def __init__(self):
        self.stdin = CaptureStream()
        self.terminated = False

    def poll(self):
        return None if not self.terminated else 0

    def terminate(self):
        self.terminated = True

    def wait(self, timeout=None):
        return 0

    def kill(self):
        self.terminated = True

class DesktopPairingTests(unittest.TestCase):
    def test_owner_matches_native_folder_and_stops_memory_only_worker(self):
        with tempfile.TemporaryDirectory(prefix="ascension-pairing-") as directory:
            token = str(uuid.uuid4())
            marker = ".ascension-bg-pair-" + token + ".tmp"
            (Path(directory) / marker).write_text(token, encoding="utf-8")
            worker = FakeWorker()
            with patch.object(device.shutil, "which", return_value="/usr/bin/node"), \
                 patch.object(device.subprocess, "Popen", return_value=worker) as spawn:
                manager = device.BackgroundSyncManager()
                reply = manager.start({
                    "libraryKey": CARD, "deviceId": DEVICE_ID,
                    "directory": directory, "passphrase": PASS,
                    "token": token, "marker": marker,
                })
                self.assertTrue(reply["active"])
                args, kwargs = spawn.call_args
                self.assertEqual(len(args[0]), 2)
                self.assertNotIn(PASS, str(args) + str(kwargs))
                self.assertNotIn(CARD, str(args) + str(kwargs))
                config = json.loads(worker.stdin.saved)
                self.assertEqual(config["passphrase"], PASS)
                self.assertEqual(config["libraryKey"], CARD)
                self.assertEqual(config["directory"], str(Path(directory).resolve()))
                with self.assertRaisesRegex(ValueError, "Another Library Card"):
                    manager.stop({"libraryKey": "b" * 64})
                self.assertFalse(worker.terminated)
                self.assertEqual(manager.stop({"libraryKey": CARD}), {"active": False})
                self.assertTrue(worker.terminated)

    def test_mismatched_owner_folder_cannot_activate_worker(self):
        with tempfile.TemporaryDirectory() as selected, tempfile.TemporaryDirectory() as supplied:
            token = str(uuid.uuid4())
            marker = ".ascension-bg-pair-" + token + ".tmp"
            (Path(selected) / marker).write_text(token, encoding="utf-8")
            with patch.object(device.subprocess, "Popen") as spawn:
                manager = device.BackgroundSyncManager()
                with self.assertRaisesRegex(ValueError, "does not match"):
                    manager.start({
                        "libraryKey": CARD, "deviceId": DEVICE_ID,
                        "directory": supplied, "passphrase": PASS,
                        "token": token, "marker": marker,
                    })
                spawn.assert_not_called()
                self.assertIsNone(manager.process)

if __name__ == "__main__":
    unittest.main()
