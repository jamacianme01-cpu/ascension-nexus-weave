"""Deployment contract checks; never imports private code or uses Fly secrets."""
from __future__ import annotations

import pathlib
import subprocess
import sys
import tempfile
import tomllib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
REQUIRED = (
    "ASCENSION_CORE/__init__.py",
    "ASCENSION_CORE/cloud_queue_worker.py",
    "ASCENSION_CORE/objective_intake.py",
    "ASCENSION_CORE/objective_runtime.py",
    "ASCENSION_CORE/live_runtime.py",
    "ASCENSION_CORE/engine_mesh.py",
    "ASCENSION_CORE/governed_closure.py",
    "ASCENSION_CORE/knowledgeverse_runtime.py",
    "ASCENSION_CORE/publication_contract.py",
    "clarity/__init__.py",
    "clarity/core_runtime.py",
    "clarity/contradiction_engine.py",
    "clarity/alchemy_layer.py",
    "clarity/hypothesis_engine.py",
    "clarity/identity_finder.py",
    "clarity/emergence_engine.py",
)


class FlyPrivateRuntimeContract(unittest.TestCase):
    def test_fly_is_web_and_private_worker(self):
        with (ROOT / "fly.toml").open("rb") as file:
            config = tomllib.load(file)
        self.assertEqual(config["processes"], {"web": "web", "worker": "worker"})
        self.assertEqual(config["http_service"]["processes"], ["web"])
        self.assertIn({"source": "ascension_state", "destination": "/data/ascension",
                       "processes": ["worker"]}, config["mounts"])
        self.assertEqual(config["experimental"]["entrypoint"],
                         ["/usr/local/bin/ascension-start"])
        self.assertNotIn("ASCENSION_PUBLISH_TOKEN", (ROOT / "fly.toml").read_text())

    def test_existing_core_in_private_only(self):
        docker = (ROOT / "Dockerfile").read_text(encoding="utf-8")
        self.assertIn("COPY --from=build /app/.private_runtime/ASCENSION_CORE /app/ASCENSION_CORE", docker)
        self.assertIn("COPY --from=build /app/.private_runtime/clarity /app/clarity", docker)
        self.assertIn("verify_fly_private_core.py", docker)
        self.assertIn("/.private_runtime/", (ROOT / ".gitignore").read_text())
        self.assertFalse((ROOT / "ASCENSION_CORE").exists(),
                         "The owner's governed engine source must never enter public Git")

    def test_script_syntax_and_real_core_entrypoint(self):
        launch = ROOT / "scripts" / "ascension-fly-entrypoint.sh"
        subprocess.run(["sh", "-n", str(launch)], check=True)
        text = launch.read_text()
        self.assertIn("-m ASCENSION_CORE.cloud_queue_worker", text)
        self.assertIn("published/governed_state.json", text)
        self.assertIn("ASCENSION_PUBLISH_TOKEN", text)
        self.assertNotIn("127.0.0.1:11434", text)
        self.assertNotIn("GORDONS", text)

    def test_missing_private_core_blocks_deployment(self):
        validate = ROOT / "scripts" / "verify_fly_private_core.py"
        with tempfile.TemporaryDirectory() as directory:
            missing = subprocess.run(
                [sys.executable, str(validate), directory],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(missing.returncode, 2)
            self.assertIn("ASCENSION private Fly engine deployment BLOCKED", missing.stderr)
            for relative in REQUIRED:
                path = pathlib.Path(directory) / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("# Owner source would be supplied privately\n", encoding="utf-8")
            valid = subprocess.run([sys.executable, str(validate), directory],
                                   capture_output=True, text=True, check=False)
            self.assertEqual(valid.returncode, 0, valid.stderr)
            (pathlib.Path(directory) / "ASCENSION_CORE/objective_runtime.py").write_text(
                "def invalid(:\n", encoding="utf-8")
            invalid = subprocess.run([sys.executable, str(validate), directory],
                                     capture_output=True, text=True, check=False)
            self.assertEqual(invalid.returncode, 2)


if __name__ == "__main__":
    unittest.main()
