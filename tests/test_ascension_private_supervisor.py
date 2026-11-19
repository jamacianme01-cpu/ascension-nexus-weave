"""Worker supervision must distinguish process failures from graceful Fly shutdowns."""
import contextlib
import io
import pathlib
import runpy
import signal
import subprocess
import sys
import unittest
from unittest.mock import patch

SUPERVISOR = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "ascension-owner-queue" / "ascension-private-supervisor.py"

class FakeChild:
    def __init__(self, returncode):
        self.returncode = returncode
        self.terminated = False

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = -15

    def wait(self, timeout=None):
        return self.returncode

    def kill(self):
        self.returncode = -9

class FakeHealth:
    status = 200
    def __enter__(self): return self
    def __exit__(self, *_): return False

class SupervisorExitTests(unittest.TestCase):
    def execute(self, first_exit, graceful=False):
        children = [FakeChild(None), FakeChild(first_exit)]
        signal_handlers = {}

        def capture_signal(signum, handler):
            signal_handlers[signum] = handler

        def fake_sleep(_):
            if graceful:
                signal_handlers[signal.SIGTERM]()

        output = io.StringIO()
        exit_code = 0
        with patch.object(sys, "argv", [str(SUPERVISOR)]), \
             patch("subprocess.Popen", side_effect=children), \
             patch("signal.signal", side_effect=capture_signal), \
             patch("time.sleep", side_effect=fake_sleep), \
             patch("urllib.request.urlopen", return_value=FakeHealth()), \
             contextlib.redirect_stdout(output):
            try:
                runpy.run_path(str(SUPERVISOR), run_name="__main__")
            except SystemExit as exc:
                exit_code = exc.code
        return exit_code, children, output.getvalue()

    def test_unexpected_clean_exit_is_a_worker_failure(self):
        code, children, output = self.execute(0)
        self.assertEqual(code, 1)
        self.assertTrue(children[0].terminated)
        self.assertIn("ASCENSION_PRIVATE_PROCESS_STOPPED exit_code=0", output)

    def test_unexpected_crash_is_a_worker_failure(self):
        code, children, output = self.execute(17)
        self.assertEqual(code, 1)
        self.assertTrue(children[0].terminated)
        self.assertIn("exit_code=17", output)

    def test_sigterm_is_clean_shutdown(self):
        code, children, output = self.execute(None, graceful=True)
        self.assertEqual(code, 0)
        self.assertTrue(all(child.terminated for child in children))
        self.assertNotIn("ASCENSION_PRIVATE_PROCESS_STOPPED", output)

if __name__ == "__main__":
    unittest.main()
