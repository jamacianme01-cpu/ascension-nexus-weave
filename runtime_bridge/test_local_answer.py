import io
import json
import unittest
from unittest.mock import patch

from local_answer import generate_local_draft


class LocalAnswerTests(unittest.TestCase):
    def model_says(self, content):
        def fake_open(request, timeout):
            self.assertIn("/chat/completions", request.full_url)
            self.assertEqual(timeout, 180)
            return io.BytesIO(json.dumps({"choices": [{"message": {"content": content}}]}).encode())
        return patch("local_answer.urlopen", fake_open)

    def test_question_gets_answer(self):
        with self.model_says("Multiplication combines equal groups. For example, three groups of four make 4 + 4 + 4 = 12. Split a larger factor into tens and ones, multiply separately, and add the partial products."):
            result = generate_local_draft("how do you multiply")
        self.assertEqual(result["kind"], "answer")
        self.assertIn("4 + 4 + 4 = 12", result["body"])
        self.assertEqual(result["files"], [])

    def test_question_about_an_app_is_an_answer(self):
        with self.model_says("A booking app stores a customer's request, a service time, and a contact method. It checks whether that time is open before saving a reservation, then shows a confirmation. For example, a barber could set one-hour slots and prevent two customers from reserving the same slot."):
            result = generate_local_draft("What does a booking app do?")
        self.assertEqual(result["kind"], "answer")
        self.assertEqual(result["files"], [])

    def test_drawing_is_an_actual_svg(self):
        svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><rect x="40" y="35" width="220" height="30"/><circle cx="90" cy="50" r="12"/><circle cx="210" cy="50" r="12"/></svg>'
        with self.model_says(svg):
            result = generate_local_draft("draw a simple electric motor")
        self.assertEqual(result["kind"], "artifact")
        self.assertEqual(result["files"][0]["name"], "drawing.svg")

    def test_design_is_not_receipt(self):
        with self.model_says("A gel support shoe has a removable dual-density gel heel pod, a broad arch plate, and an adjustable breathable upper. Prototype the midsole at two hardness levels, then measure fit, compression fatigue, and slip resistance before manufacturing."):
            result = generate_local_draft("make a gel support shoe")
        self.assertEqual(result["kind"], "answer")
        self.assertIn("heel pod", result["body"])

    def test_app_requires_functional_source(self):
        html = "<!doctype html><html><body><h1>Service booking</h1><form id='f'><input id='name'><button>Book</button></form><ul id='list'></ul><script>document.querySelector('#f').onsubmit=e=>{e.preventDefault();let li=document.createElement('li');li.textContent=document.querySelector('#name').value;document.querySelector('#list').append(li)}</script></body></html>"
        with self.model_says(html):
            result = generate_local_draft("make a quick money making app")
        self.assertEqual(result["files"][0]["name"], "index.html")
        self.assertIn("onsubmit", result["files"][0]["content"])
        with self.model_says("Created a verified app. Status: running."):
            with self.assertRaisesRegex(RuntimeError, "functional HTML"):
                generate_local_draft("make a quick money making app")


if __name__ == "__main__":
    unittest.main()
