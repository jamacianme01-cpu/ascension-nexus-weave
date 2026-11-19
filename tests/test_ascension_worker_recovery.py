"""ASCENSION V1: original-core worker crashes never turn into fabricated results."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts' / 'ascension-owner-queue' / 'ascension-volume-transport.py'
spec = importlib.util.spec_from_file_location('ascension_volume_transport_test', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OriginalWorkerCrashTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.runs = Path(self.tmp.name) / 'runs'
        self.runs.mkdir()
        # This unit only tests the interrupted-run mutation, without loading or
        # mutating the owner's private ASCENSION_CORE/live published state.
        self.store = object.__new__(module.TransportStore)
        self.store.runs = self.runs

    def add(self, status, runner='fly-ascension-core'):
        rid = str(uuid.uuid4())
        run = {'id':rid, 'objective':'Explain electrical resistance',
               'status':status, 'claimed_by':runner, 'stage':'engaged',
               'result': None, 'error':None}
        module.atomic_json(self.store.file(rid), {'run':run, 'guest_token_hash':'unchanged', 'artifacts':[]})
        return rid

    def get(self, request_id):
        return module.load_json(self.store.file(request_id))

    def test_interrupted_original_worker_is_failed_without_retry(self):
        claimed = self.add('claimed')
        running = self.add('running')
        verified = self.add('verified')
        queued = self.add('queued')
        another = self.add('running', 'another-original-worker')
        result = self.store.worker_exited({'runner':'fly-ascension-core'})
        self.assertEqual(result['failed_count'], 2)
        for rid in (claimed, running):
            obj = self.get(rid)
            self.assertEqual(obj['run']['status'], 'failed')
            self.assertEqual(obj['run']['stage'], 'original_worker_exited')
            self.assertIsNone(obj['run']['result'])
            self.assertIn('not retried', obj['run']['error'])
            self.assertEqual(obj['artifacts'], [])
        self.assertEqual(self.get(verified)['run']['status'], 'verified')
        self.assertEqual(self.get(queued)['run']['status'], 'queued')
        self.assertEqual(self.get(another)['run']['status'], 'running')
        self.assertEqual(self.store.worker_exited({'runner':'fly-ascension-core'})['failed_count'],0)

    def test_invalid_runner_is_rejected(self):
        for runner in (None, '', 9, ' ' * 250):
            with self.subTest(runner=runner):
                with self.assertRaises(ValueError):
                    self.store.worker_exited({'runner':runner})


if __name__ == '__main__':
    unittest.main()
