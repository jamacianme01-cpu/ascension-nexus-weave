"""Guard that the ENGAGE runner must generate real source before any queue claim."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import ModuleType
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ascension_engage_preflight.py"
spec = importlib.util.spec_from_file_location("ascension_engage_preflight", SCRIPT)
sut = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sut)


class SmokeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "ASCENSION_CORE").mkdir()
        (self.root / "ASCENSION_CORE" / "capabilities.py").write_text("# mock", encoding="utf-8")

    def modules(self, *, route="software_project", ready=True, files=None):
        core = ModuleType("ASCENSION_CORE")
        capabilities = ModuleType("ASCENSION_CORE.capabilities")
        capabilities.REGISTRY = {"software_project": object()}
        capabilities.select_capability = lambda objective, mes: route
        engine = ModuleType("ASCENSION_CORE.software_project_executor")
        engine.preflight = lambda: (ready, "not installed" if not ready else "ok")
        engine.create_software_artifacts = lambda objective, branch: files or {
            "index.html": "<html><body><button>Play</button></body></html>",
            "README.md": "Created source: user must test functionality",
            "verification.json": json.dumps({"functional_browser_tested": False}),
        }
        return {
            "ASCENSION_CORE": core,
            "ASCENSION_CORE.capabilities": capabilities,
            "ASCENSION_CORE.software_project_executor": engine,
        }

    def test_creates_real_local_files_with_honest_scope(self):
        with patch.dict(sys.modules, self.modules()):
            output = sut.run(self.root)
        self.assertTrue((output / "index.html").exists())
        self.assertEqual(json.loads((output / "verification.json").read_text())["functional_browser_tested"], False)
        self.assertFalse((self.root / "ASCENSION_CORE" / "state").exists())

    def test_missing_capability_blocks_before_file_creation(self):
        with patch.dict(sys.modules, self.modules(route="unavailable:software_design")):
            with self.assertRaisesRegex(RuntimeError, "not registered"):
                sut.run(self.root)
        self.assertFalse((self.root / "generated_artifacts").exists())

    def test_offline_model_unavailable_blocks_before_file_creation(self):
        with patch.dict(sys.modules, self.modules(ready=False)):
            with self.assertRaisesRegex(RuntimeError, "not ready"):
                sut.run(self.root)
        self.assertFalse((self.root / "generated_artifacts").exists())

    def test_exaggerated_browser_verification_is_blocked(self):
        files = {
            "index.html": "<html><body>not verified</body></html>",
            "verification.json": json.dumps({"functional_browser_tested": True}),
        }
        with patch.dict(sys.modules, self.modules(files=files)):
            with self.assertRaisesRegex(RuntimeError, "overstated"):
                sut.run(self.root)
        self.assertFalse((self.root / "generated_artifacts").exists())


if __name__ == "__main__":
    unittest.main()
