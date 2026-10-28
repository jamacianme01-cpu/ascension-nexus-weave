"""Executable version-dispatch proof, with mocked model transport, no fake hosted claims."""
import importlib.util
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import sys
import unittest
from unittest import mock


path = Path(__file__).resolve().parents[1] / "scripts" / "ascension_version_worker.py"
spec = importlib.util.spec_from_file_location("ascension_version_worker", path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class VersionDispatchTests(unittest.TestCase):
    def setUp(self):
        self.branches = [
            {"id": "one", "approach": "approach-one", "capability": "software_project",
             "actions": ["plan design one"]},
            {"id": "two", "approach": "approach-two", "capability": "software_project",
             "actions": ["plan design two"]},
            {"id": "three", "approach": "approach-three", "capability": "software_project",
             "actions": ["plan design three"]},
        ]
        self.directions = [
            {"label": f"Version {i}", "summary": f"Distinct mechanism {i}", "distinctive_interaction": f"action {i}",
             "features": [f"feature {i}a", f"feature {i}b"]}
            for i in range(4)
        ]

    def test_four_artifacts_are_generated_with_blend_direction(self):
        created = []
        def adapter(_root, objective, branch, _previous):
            created.append((objective, branch["id"], branch["direction"]["label"]))
            markers = {"one": "alpha", "two": "bravo", "three": "charlie", "blend": "delta"}
            marker = markers[branch["id"]]
            return {"index.html": "<html><body><script>const implementation = '" + marker * 40 +
                                  "';function start(){return implementation;}</script></body></html>",
                    "verification.json": '{"functional_browser_tested":false}'}
        with mock.patch.object(mod, "plan_distinct_directions", return_value=self.directions), \
             mock.patch.dict(mod.ADAPTERS, {"software_project": adapter}):
            versions = mod.generate_versions(Path("."), "make an app", self.branches)
        self.assertEqual(len(versions), 4)
        self.assertTrue(all(v["status"] == "created" for v in versions))
        self.assertEqual([v["id"] for v in versions], ["one", "two", "three", "blend"])
        self.assertEqual(versions[3]["blend_from"], ["one", "two", "three"])
        self.assertEqual(len(set(v["files"][0]["sha256"] for v in versions)), 4)
        self.assertEqual(len(created), 4)

    def test_partial_recovery_preserves_three_accepted_outputs_without_regeneration(self):
        created = []
        def adapter(_root, objective, branch, _previous):
            created.append(branch["id"])
            markers = {"one": "alpha", "two": "bravo", "three": "charlie", "blend": "delta"}
            marker = markers[branch["id"]]
            return {
                "index.html": "<html><body><script>const implementation = '" +
                              marker * 40 + "';</script></body></html>",
                "verification.json": '{"functional_browser_tested":false}',
            }
        with mock.patch.object(mod, "plan_distinct_directions", return_value=self.directions), \
             mock.patch.dict(mod.ADAPTERS, {"software_project": adapter}):
            versions = mod.generate_versions(Path("."), "make an app", self.branches)
            created.clear()
            old_one = {
                **versions[0], "status": "unavailable", "files": [],
                "verification_scope": "Executor failed to create verified source: Local coding model request failed",
            }
            saved = [old_one, *versions[1:]]
            with mock.patch.object(mod, "plan_distinct_directions", side_effect=AssertionError("Do not call planner again")):
                output = StringIO()
                with redirect_stdout(output):
                    recovered = mod.generate_versions(Path("."), "make an app", self.branches, saved)
        self.assertEqual(created, ["one"])
        self.assertEqual([v["status"] for v in recovered], ["created"] * 4)
        self.assertEqual(recovered[1:], saved[1:])
        self.assertIn("OUTPUT VERSION 2 PRESERVED", output.getvalue())
        self.assertIn("OUTPUT VERSION 4 PRESERVED", output.getvalue())

    def test_full_recovery_runs_no_generators(self):
        saved = [
            {"id": bid, "kind": "blend" if i == 3 else "pathway",
             "status": "created", "files": [{"name": "index.html", "content": bid}],
             "label": bid, "summary": bid, "blend_from": self.branches and
             [b["id"] for b in self.branches] if i == 3 else [],
             "verification_scope": "syntax only"}
            for i, bid in enumerate(["one", "two", "three", "blend"])
        ]
        with mock.patch.object(mod, "plan_distinct_directions", side_effect=AssertionError("Should not plan")):
            returned = mod.generate_versions(Path("."), "make an app", self.branches, saved)
        self.assertEqual(returned, saved)

    def test_duplicate_output_cannot_count_as_four_versions(self):
        def same(*args):
            return {"index.html": "<html><body>repeated implementation</body></html>"}
        with mock.patch.object(mod, "plan_distinct_directions", return_value=self.directions), \
             mock.patch.dict(mod.ADAPTERS, {"software_project": same}):
            versions = mod.generate_versions(Path("."), "make an app", self.branches)
        self.assertEqual(versions[0]["status"], "created")
        self.assertTrue(all(x["status"] == "unavailable" for x in versions[1:]))
        self.assertTrue(all(not x["files"] for x in versions[1:]))

    def test_missing_executor_is_not_represented_as_a_finished_invention(self):
        branches = [{**b, "capability": "real_cad_executor"} for b in self.branches]
        output = StringIO()
        with redirect_stdout(output):
            versions = mod.generate_versions(Path("."), "make a physical design", branches)
        self.assertEqual(len(versions), 4)
        self.assertTrue(all(v["status"] == "unavailable" for v in versions))
        self.assertFalse(any(v["files"] for v in versions))
        self.assertEqual(output.getvalue().count("OUTPUT VERSION FAILURE REASON:"), 4)
        self.assertIn("No real output-producing executor registered", output.getvalue())

    def test_failed_design_divergence_does_not_make_up_versions(self):
        with mock.patch.object(mod, "plan_distinct_directions", side_effect=ValueError("no real plan")):
            versions = mod.generate_versions(Path("."), "make an app", self.branches)
        self.assertEqual(len(versions), 4)
        self.assertTrue(all(v["status"] == "unavailable" for v in versions))

    def test_malformed_branch_set_is_refused(self):
        with self.assertRaisesRegex(ValueError, "three distinct"):
            mod.generate_versions(Path("."), "make an app", self.branches[:2])


if __name__ == "__main__":
    unittest.main()
