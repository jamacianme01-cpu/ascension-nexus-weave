"""Offline regression tests for ASCENSION's Hunyuan HTTPS transfer reliability."""
from __future__ import annotations

import io
import ssl
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hunyuan_model_worker as worker


class Response:
    headers = {"content-type": "image/png"}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return b"valid transfer"


class TransferReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.request = worker.urllib.request.Request("https://example.invalid/reference.png")

    def test_transient_tls_eof_retries_then_succeeds(self):
        causes = [ssl.SSLEOFError("EOF occurred in violation of protocol")] * 3
        with patch.object(worker.urllib.request, "urlopen", side_effect=causes + [Response()]) as opener, patch.object(worker.time, "sleep"):
            body, headers = worker._open_with_retry(self.request, 3, operation="reference image download")
        self.assertEqual(body, b"valid transfer")
        self.assertEqual(headers["content-type"], "image/png")
        self.assertEqual(opener.call_count, 4)

    def test_permanent_http_error_does_not_retry(self):
        error = urllib.error.HTTPError(self.request.full_url, 403, "forbidden", {}, io.BytesIO(b"403"))
        with patch.object(worker.urllib.request, "urlopen", side_effect=error) as opener:
            with self.assertRaises(urllib.error.HTTPError):
                worker._open_with_retry(self.request, 3)
        self.assertEqual(opener.call_count, 1)

    def test_certificate_failure_does_not_retry(self):
        error = urllib.error.URLError(ssl.SSLCertVerificationError("certificate verify failed"))
        with patch.object(worker.urllib.request, "urlopen", side_effect=error) as opener:
            with self.assertRaisesRegex(RuntimeError, "certificate verification failed"):
                worker._open_with_retry(self.request, 3, operation="GLB upload")
        self.assertEqual(opener.call_count, 1)

    def test_exhausted_retries_report_transfer_stage(self):
        error = ssl.SSLEOFError("EOF occurred in violation of protocol")
        with patch.object(worker.urllib.request, "urlopen", side_effect=error) as opener, patch.object(worker.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "GLB upload interrupted after 6 attempts"):
                worker._open_with_retry(self.request, 3, operation="GLB upload")
        self.assertEqual(opener.call_count, 6)


if __name__ == "__main__":
    unittest.main()
