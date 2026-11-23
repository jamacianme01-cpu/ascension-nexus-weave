"""Offline safeguards for the owner's original Windows/Oracle hybrid runtime."""
import ast
import pathlib
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
TRANSPORT = ROOT / "scripts" / "ascension-owner-queue" / "ascension-volume-transport.py"
LAUNCH = ROOT / "scripts" / "Start-ASCENSION-OwnerHybrid.ps1"


class OwnerHybridLaunchTest(unittest.TestCase):
    def test_real_transport_has_owner_loopback_bind(self):
        source = TRANSPORT.read_text(encoding="utf-8")
        ast.parse(source)
        self.assertIn("class IPv4Server", source)
        self.assertIn("socket.AF_INET", source)
        self.assertIn("'127.0.0.1'", source)
        self.assertIn("'::'", source)  # preserve historical owner worker default
        result = subprocess.run(
            [sys.executable, str(TRANSPORT), "--help"],
            capture_output=True, text=True, check=True, timeout=10,
        )
        self.assertIn("--host", result.stdout)
        self.assertIn("--live-root", result.stdout)

    def test_owner_original_source_guard_and_no_old_pc(self):
        source = LAUNCH.read_text(encoding="utf-8")
        for required in (
            "GORDONS", "ASCENSION_ORIGINAL_ROOT", "ASCENSION_CORE",
            "clarity\\core_runtime.py", "governed_state.json",
            "ASCENSION_PUBLISH_TOKEN", "127.0.0.1:9091",
            "127.0.0.1:4174", "owner_queue_transport_connected",
        ):
            self.assertIn(required, source)
        self.assertIn("No substitute core", source)
        self.assertNotIn("flyctl", source.lower())
        self.assertNotIn("api.machines.dev", source.lower())

    def test_owner_disconnected_all_fly_workflows(self):
        # Owner removed every Fly workflow entirely; do not require a
        # deleted workflow to exist in order to pass offline CI.
        workflows = ROOT / ".github" / "workflows"
        for retired in (
            "activate-owner-fly-volume-queue.yml",
            "deploy-ascension-fly.yml",
            "ascension-fly-disconnect-once.yml",
            "verify-ascension-fly-governed-wiring.yml",
        ):
            self.assertFalse((workflows / retired).exists(), retired)
        for active in workflows.glob("*.yml"):
            text = active.read_text(encoding="utf-8")
            self.assertNotIn("FLY_API_TOKEN", text, active.name)
            self.assertNotIn("flyctl ", text, active.name)


if __name__ == "__main__":
    unittest.main()
