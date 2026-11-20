"""Guard the owner's existing private Fly worker lifecycle, not a replacement worker."""
import pathlib
import tomllib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class ExistingWorkerLifecycleTests(unittest.TestCase):
    def test_original_worker_is_always_on_without_modifying_app_policy(self):
        config = tomllib.loads((ROOT / "fly.owner-queue.toml").read_text())
        restarts = config.get("restart", [])
        self.assertTrue(any(x.get("policy") == "always" and x.get("processes") == ["worker"] for x in restarts))
        self.assertFalse(any("app" in x.get("processes", []) for x in restarts))
        mounts = config.get("mounts", [])
        self.assertTrue(any(x.get("source") == "ascension_state" and x.get("processes") == ["worker"] for x in mounts))
        self.assertEqual(config["env"]["ASCENSION_VOLUME_TRANSPORT_URL"], "http://worker.process.ascension-nexus-weave.internal:9091")

    def test_machine_update_applies_and_verifies_policy(self):
        source = (ROOT / ".github/workflows/activate-owner-fly-volume-queue.yml").read_text()
        self.assertIn("--restart always --image", source)
        self.assertIn('.config.restart.policy == "always"', source)
        self.assertIn('flyctl machine update "$worker_id"', source)
        self.assertIn("worker_count", source)

if __name__ == "__main__":
    unittest.main()
