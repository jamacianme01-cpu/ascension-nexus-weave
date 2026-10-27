"""Tests for independent ASCENSION knowledge memory and privacy boundaries."""
import pathlib
import sys
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from ascension_knowledge_memory import KnowledgeMemory

def pathway(summary="Uses existing sensors with source-attributed parts"):
    return {"id":"path-1","label":"Camera-guided helper drone",
            "summary":summary,"steps":["Validate observation source","Verify parts"],
            "parts":[{"name":"Camera","purpose":"Observation"}]}

class MemoryTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.memory=KnowledgeMemory(pathlib.Path(self.temp.name)/"memory.sqlite")
    def tearDown(self):
        self.memory.close()
        self.temp.cleanup()

    def save(self,owner="alice",status="PERSISTED",detail=None):
        return self.memory.save(owner_id=owner,source_request_id="REQ:123",
                source_status=status,objective="Create a helper drone",
                pathway=detail or pathway(),
                provenance={"knowledgeverse_id":"KV:ascension-live",
                            "source_classification":"LIVE_GOVERNED"})
    def test_private_by_default(self):
        entry=self.save()
        self.assertEqual(entry["sharing_state"],"private")
        self.assertEqual(len(self.memory.recall("helper drone",owner_id="alice")),1)
        self.assertEqual(self.memory.recall("helper drone",owner_id="bob"),[])
    def test_approved_cross_user_reuse(self):
        entry=self.save()
        self.assertTrue(self.memory.approve_for_reuse(entry["memory_id"],owner_id="alice"))
        found=self.memory.recall("helper drone",owner_id="bob")
        self.assertEqual(len(found),1)
        self.assertEqual(found[0]["sharing_state"],"approved")
        self.assertIsNone(found[0]["source_request_id"])
        self.assertFalse(found[0]["owned"])
    def test_other_user_cannot_approve(self):
        entry=self.save()
        self.assertFalse(self.memory.approve_for_reuse(entry["memory_id"],owner_id="bob"))
        self.assertEqual(self.memory.recall("helper drone",owner_id="bob"),[])
    def test_unverified_cannot_be_shared(self):
        entry=self.save(status="UNVERIFIED")
        with self.assertRaisesRegex(ValueError,"Only persisted"):
            self.memory.approve_for_reuse(entry["memory_id"],owner_id="alice")
    def test_private_path_cannot_be_shared(self):
        entry=self.save(detail=pathway("Found in C:\\Users\\Alice\\Private\\"))
        with self.assertRaisesRegex(ValueError,"private information"):
            self.memory.approve_for_reuse(entry["memory_id"],owner_id="alice")
    def test_identical_content_does_not_mix_owners(self):
        alice=self.save("alice")
        bob=self.save("bob")
        self.assertNotEqual(alice["memory_id"],bob["memory_id"])
        self.assertEqual(len(self.memory.recall("helper",owner_id="alice")),1)
        self.assertEqual(len(self.memory.recall("helper",owner_id="bob")),1)
    def test_duplicate_idempotent(self):
        first=self.save()
        second=self.save()
        self.assertEqual(first["memory_id"],second["memory_id"])
        self.assertEqual(len(self.memory.recall("helper drone",owner_id="alice")),1)

if __name__=="__main__": unittest.main()
