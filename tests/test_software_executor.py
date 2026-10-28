"""Offline executor gate/installer regression tests; no model or project mutation."""
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock


def load(name, filename):
    path = Path(__file__).resolve().parents[1] / "scripts" / filename
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


engine = load("ascension_software_executor", "ascension_software_executor.py")
install = load("install_software_executor", "install_software_executor.py")

JS = "document.getElementById('play').addEventListener('click', () => {document.getElementById('out').textContent = 'playing';});"
HTML = ("<!doctype html><html><head><title>Real music app</title><style>"
        "body{font-family:sans-serif}" + "p{margin:10px}" * 90 +
        "</style></head><body><h1>Music App</h1><button id='play'>Play</button>"
        "<p id='out'></p><script>" + JS + "</script></body></html>")


class SoftwareExecutorTests(unittest.TestCase):
    def test_supported_scope(self):
        self.assertTrue(engine.supports_browser_app("make a music app"))
        self.assertTrue(engine.supports_browser_app("build a website"))
        self.assertFalse(engine.supports_browser_app("build a native Android app"))
        self.assertFalse(engine.supports_browser_app("make a server backend app"))
        self.assertFalse(engine.supports_browser_app("make worker drones"))

    def test_missing_node_fails_closed(self):
        with mock.patch.object(engine.shutil, "which", return_value=None):
            self.assertFalse(engine.preflight()[0])

    def test_offline_valid_html_syntax_checked_without_execution(self):
        result = types.SimpleNamespace(returncode=0, stderr="")
        with mock.patch.object(engine.subprocess, "run", return_value=result) as run:
            proof = engine.verify_offline_app(HTML)
        self.assertFalse(proof["functional_browser_tested"])
        self.assertEqual(proof["checker"], "node --check")
        run.assert_called_once()
        self.assertEqual(run.call_args.args[0][:2], ["node", "--check"])

    def test_syntax_failure_does_not_become_verified(self):
        with mock.patch.object(engine.subprocess, "run", return_value=types.SimpleNamespace(returncode=1, stderr="Unexpected token")):
            with self.assertRaisesRegex(ValueError, "syntax errors"):
                engine.verify_offline_app(HTML)

    def test_external_resources_blocked(self):
        with self.assertRaisesRegex(ValueError, "external"):
            engine.verify_offline_app(HTML.replace("</head>", '<script src="https://example.org/tracker.js"></script></head>'))

    def test_generated_result_carries_csp_and_honest_proof_scope(self):
        with mock.patch.object(engine, "preflight", return_value=(True, "ready")), \
             mock.patch.object(engine, "_call_ollama", return_value=HTML), \
             mock.patch.object(engine.subprocess, "run", return_value=types.SimpleNamespace(returncode=0, stderr="")):
            result = engine.create_software_artifacts("make a music app", "BR:music-app:fast")
        self.assertIn("connect-src 'none'", result["index.html"])
        self.assertIn("functional_browser_tested", result["verification.json"])
        self.assertIs(json.loads(result["verification.json"])["functional_browser_tested"], False)
        self.assertIn("NOT verified", result["README.md"])


class SoftwareInstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.core = root / "ASCENSION_CORE"
        self.core.mkdir()
        self.root = root
        self.module = root / "module.py"
        self.module.write_text('"""source"""\n', encoding="utf-8")
        self.cap = self.core / "capabilities.py"
        self.obj = self.core / "objective_runtime.py"
        self.cap.write_text(
            install.CAP_IMPORT +
            'from typing import Dict, List\n' +
            'class CapabilityContract:\n    pass\n'
            'class DigitalArtifactWriter:\n    pass\n'
            'class DocumentBundleCapability:\n    pass\n' +
            install.CAP_ADVERTISE +
            'def select_capability(destiny, mes, requested_type=""):\n'
            + install.CAP_SELECT +
            '        return "unavailable:" + contract\n'
            '    return "digital_artifact_writer"\n'
            '\nREGISTRY: Dict[str, object] = {\n'
            + install.CAP_REGISTRY + '}\n',
            encoding="utf-8",
        )
        self.obj.write_text(
            'def write_objective(capability, selected_branch, mes, objective_text):\n'
            + install.OBJ_WRITE +
            'def objective_artifact_writer(selected_branch, receipt):\n'
            + install.OBJ_WORKBENCH +
            '            return receipt\n'
            '        except Exception:\n'
            '            raise\n',
            encoding="utf-8",
        )

    def test_dry_run_does_not_modify(self):
        before = self.cap.read_bytes()
        result = install.install(self.root, self.module, dry_run=True)
        self.assertEqual(result["status"], "compatible")
        self.assertEqual(self.cap.read_bytes(), before)
        self.assertFalse((self.core / "software_project_executor.py").exists())

    def test_install_adds_only_expected_source_and_backup(self):
        result = install.install(self.root, self.module)
        self.assertEqual(result["status"], "installed")
        self.assertFalse(result["publication_mutated"])
        self.assertTrue(Path(result["backup"]).is_dir())
        self.assertIn('"software_project": SoftwareProjectCapability()', self.cap.read_text())
        self.assertIn('receipt["requested_result_produced"] = False', self.obj.read_text())
        self.assertTrue((self.core / "software_project_executor.py").is_file())
        with self.assertRaisesRegex(RuntimeError, "already installed"):
            install.install(self.root, self.module)

    def test_mismatch_never_writes(self):
        self.obj.write_text("different runtime", encoding="utf-8")
        original = self.cap.read_bytes()
        with self.assertRaisesRegex(RuntimeError, "compatibility"):
            install.install(self.root, self.module)
        self.assertEqual(self.cap.read_bytes(), original)
        self.assertFalse((self.core / "software_project_executor.py").exists())


if __name__ == "__main__":
    unittest.main()
