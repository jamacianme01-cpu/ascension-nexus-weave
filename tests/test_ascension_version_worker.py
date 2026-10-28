"""Executable version-dispatch proof, with mocked model transport, no fake hosted claims."""
import importlib.util
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
            return {"index.html": "<html><body><script>const a = " + branch["id"] +
                                  ";</script></body></html>",
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
        versions = mod.generate_versions(Path("."), "make a physical design", branches)
        self.assertEqual(len(versions), 4)
        self.assertTrue(all(v["status"] == "unavailable" for v in versions))
        self.assertFalse(any(v["files"] for v in versions))

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
