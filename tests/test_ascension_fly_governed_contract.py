"""Offline tests: no private engine source is committed to the public site."""
import ast
import pathlib
import subprocess
import tomllib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class FlyGovernedContractTests(unittest.TestCase):
    def test_existing_production_configuration_not_replaced(self):
        self.assertTrue((ROOT / "Dockerfile").is_file())
        self.assertTrue((ROOT / "fly.toml").is_file())

    def test_worker_receives_exact_original_queue_and_root(self):
        cfg = tomllib.loads((ROOT / "fly.ascension-engines.toml").read_text())
        self.assertEqual(cfg["app"], "ascension-nexus-weave")
        self.assertEqual(cfg["processes"]["worker"], "worker")
        self.assertEqual(cfg["http_service"]["processes"], ["app"])
        self.assertEqual(cfg["mounts"][0]["processes"], ["worker"])
        self.assertEqual(cfg["env"]["ASCENSION_LIVE_ROOT"], "/data/ascension/state/live")
        self.assertEqual(cfg["env"]["ASCENSION_QUEUE_URL"],
                         "https://ascension-nexus-weave.fly.dev/api/public/ascension/execution-queue")

    def test_bootstrap_refuses_to_claim_before_migration(self):
        script = (ROOT / "scripts" / "ascension-fly-governed-entrypoint.sh").read_text()
        self.assertIn("ASCENSION_STATE_BOOTSTRAP", script)
        self.assertIn("exec sleep infinity", script)
        self.assertIn('test -f "$root/published/governed_state.json"', script)
        self.assertIn("LivePublicationStore", script)
        self.assertIn("--root", script)
        self.assertIn("ASCENSION_CORE.cloud_queue_worker", script)
        completed = subprocess.run(["sh", "-n", str(ROOT / "scripts" / "ascension-fly-governed-entrypoint.sh")],
                                   capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_proprietary_modules_only_in_private_build_context(self):
        image = (ROOT / "Dockerfile.ascension-engines").read_text()
        self.assertIn(".private_runtime/ASCENSION_CORE", image)
        self.assertIn(".private_runtime/clarity", image)
        self.assertNotIn("github.com/jamacianme01-cpu/ascensionweave", image)
        state_validator = (ROOT / "scripts" / "ascension-verify-live-state.py").read_text()
        ast.parse(state_validator)

if __name__ == "__main__":
    unittest.main()
