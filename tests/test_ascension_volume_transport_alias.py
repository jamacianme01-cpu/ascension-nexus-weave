"""Original queue protocol must work directly on the worker's secured local volume transport."""
import importlib.util
import json
import os
import pathlib
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

PATH=pathlib.Path(__file__).resolve().parents[1]/"scripts"/"ascension-owner-queue"/"ascension-volume-transport.py"
spec=importlib.util.spec_from_file_location("ascension_volume_transport",PATH)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Store:
    initial_revision=124
    def claim(self,runner):
        return {"item":{"id":"unit-test","runner":runner}}
    def report(self,payload):
        return {"ok":True,"id":payload["request_id"],"status":payload["status"]}

class QueueAliasTests(unittest.TestCase):
    def setUp(self):
        self.patch=patch.dict(os.environ,{"ASCENSION_PUBLISH_TOKEN":"test-secret"})
        self.patch.start()
        self.http=ThreadingHTTPServer(("127.0.0.1",0),module.Handler)
        self.http.ascension_store=Store()
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True)
        self.thread.start()
        self.url="http://127.0.0.1:"+str(self.http.server_port)

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=3)
        self.patch.stop()

    def test_original_worker_can_claim_with_bearer_auth(self):
        req=Request(self.url+"/api/public/ascension/execution-queue?runner=original",
                    headers={"Authorization":"Bearer test-secret"})
        with urlopen(req,timeout=3) as response:
            result=json.load(response)
        self.assertEqual(result["item"]["runner"],"original")

    def test_original_worker_can_report_with_publish_header(self):
        body=json.dumps({"request_id":"unit-test","status":"verified"}).encode()
        req=Request(self.url+"/api/public/ascension/execution-queue",body,
                    headers={"x-ascension-publish-token":"test-secret",
                             "content-type":"application/json"},method="POST")
        with urlopen(req,timeout=3) as response:
            result=json.load(response)
        self.assertTrue(result["ok"])
        self.assertEqual(result["status"],"verified")

    def test_no_auth_stays_rejected(self):
        req=Request(self.url+"/api/public/ascension/execution-queue")
        with self.assertRaises(HTTPError) as error:
            urlopen(req,timeout=3)
        self.assertEqual(error.exception.code,401)

if __name__=="__main__":
    unittest.main()
