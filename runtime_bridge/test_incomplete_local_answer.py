import io
import json
import unittest
from unittest.mock import patch
from local_answer import _visible, generate_local_draft

class IncompleteOutputTests(unittest.TestCase):
    def model(self, text, finish_reason="stop"):
        payload = {"choices": [{"message": {"content": text}, "finish_reason": finish_reason}]}
        return patch("local_answer.urlopen", lambda request, timeout: io.BytesIO(json.dumps(payload).encode()))

    def test_unclosed_reasoning_is_not_an_answer(self):
        with self.model("<think>" + "I am planning the requested result. " * 10):
            with self.assertRaisesRegex(RuntimeError, "empty visible"):
                generate_local_draft("Explain a telescope")

    def test_closed_reasoning_preserves_final_answer(self):
        answer = "A telescope gathers light with its primary lens or mirror and forms an image that an eyepiece magnifies."
        with self.model("<think>private planning</think>" + answer):
            self.assertEqual(generate_local_draft("Explain a telescope")["body"], answer)
        self.assertEqual(_visible("```html\n<!doctype html><html></html>\n```"), "<!doctype html><html></html>")

    def test_token_limit_does_not_become_completed_output(self):
        with self.model("A partial answer. " * 20, "length"):
            with self.assertRaisesRegex(RuntimeError, "cut off"):
                generate_local_draft("Explain a telescope")

    def test_incomplete_html_rejected(self):
        with self.model("<!doctype html><html><body><script>document.body.textContent='hello'"):
            with self.assertRaisesRegex(RuntimeError, "incomplete HTML"):
                generate_local_draft("Make a browser app")

    def test_incomplete_svg_rejected(self):
        with self.model('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="2"/>'):
            with self.assertRaisesRegex(RuntimeError, "incomplete SVG"):
                generate_local_draft("Draw a circle")

    def test_source_not_silently_truncated(self):
        text = "<!doctype html><html><body>" + "x" * 100000 + "<script>void 0</script></body></html>"
        with self.model(text):
            with self.assertRaisesRegex(RuntimeError, "refusing to truncate"):
                generate_local_draft("Make a browser app")

    def test_valid_sources_preserved_byte_for_byte(self):
        html = "<!doctype html><html><body><button onclick='this.textContent=1'>Count</button><script>void 0</script></body></html>"
        svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="2"/></svg>'
        for objective, source in [("Make a browser app", html), ("Draw a circle", svg)]:
            with self.subTest(objective=objective), self.model(source):
                result = generate_local_draft(objective)
                self.assertEqual(result["files"][0]["content"], source)
                self.assertIn("Check factual claims", result["limitations"][0])

if __name__ == "__main__":
    unittest.main()
