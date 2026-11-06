"""Loopback-only Hunyuan3D bridge for the approved ASCENSION browser app.

Runs on the owner's Windows PC alongside Hunyuan3D at 127.0.0.1:8081.
The public Railway server never reaches localhost or sees generated GLB bytes.
Only approved ASCENSION origins can initiate generation.
No paid API, Supabase secret, token, or cloud worker is required.
"""
from __future__ import annotations

import base64
import json
import socket
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 8082
HUNYUAN = "http://127.0.0.1:8081/generate"
MAX_POST = 14 * 1024 * 1024
MAX_GLB = 60 * 1024 * 1024
ALLOWED_ORIGINS = frozenset({
    "https://ascension-nexus-weave-production.up.railway.app",
    "https://ascensionweave.app",
    "http://localhost:4174",
    "http://127.0.0.1:4174",
    "http://127.0.0.1:8080",
    "http://localhost:8080",
})
LOCK = threading.Lock()


def hunyuan_is_up() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", 8081), timeout=1):
            return True
    except OSError:
        return False


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def cors(self) -> bool:
        origin = self.headers.get("Origin", "")
        if origin not in ALLOWED_ORIGINS:
            return False
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        return True

    def respond(self, code: int, body: bytes, content_type: str = "application/json") -> None:
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def failure(self, code: int, error: str) -> None:
        self.respond(code, json.dumps({"error": error[:220]}).encode())

    def authenticated(self) -> bool:
        host = self.headers.get("Host", "")
        return host in {"127.0.0.1:8082", "localhost:8082"} and self.headers.get("Origin") in ALLOWED_ORIGINS

    def do_OPTIONS(self) -> None:
        if not self.authenticated():
            self.failure(403, "Unapproved origin")
            return
        if self.path not in ("/status", "/generate"):
            self.failure(404, "Unknown bridge route")
            return
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "1800")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        if not self.authenticated():
            self.failure(403, "Unapproved origin")
            return
        if self.path != "/status":
            self.failure(404, "Unknown bridge route")
            return
        active = hunyuan_is_up()
        self.respond(200 if active else 503, json.dumps({
            "engine": "Hunyuan3D",
            "ready": active,
            "source": "owner-local",
            "model_format": "glb",
        }).encode())

    def do_POST(self) -> None:
        if not self.authenticated():
            self.failure(403, "Unapproved origin")
            return
        if self.path != "/generate":
            self.failure(404, "Unknown bridge route")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.failure(400, "Invalid request size")
            return
        if length < 100 or length > MAX_POST or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.failure(413, "Image payload is invalid or too large")
            return
        if not LOCK.acquire(blocking=False):
            self.failure(429, "The local Hunyuan engine is generating another model")
            return
        try:
            if not hunyuan_is_up():
                self.failure(503, "Hunyuan3D is not listening on 127.0.0.1:8081")
                return
            raw = self.rfile.read(length)
            try:
                payload = json.loads(raw)
                image = payload.get("image")
                if not isinstance(image, str) or len(image) > MAX_POST or len(image) < 100:
                    raise ValueError("Invalid image")
                source = base64.b64decode(image, validate=True)
                if not (source.startswith(b"\x89PNG\r\n\x1a\n") or
                        source.startswith(b"\xff\xd8\xff") or
                        source.startswith(b"RIFF") and source[8:12] == b"WEBP"):
                    raise ValueError("Only image bytes can reach the generator")
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                self.failure(400, "Invalid reference image: " + str(exc))
                return
            request = urllib.request.Request(
                HUNYUAN,
                method="POST",
                headers={"Content-Type": "application/json", "Accept": "model/gltf-binary"},
                data=json.dumps({"image": image}, separators=(",", ":")).encode(),
            )
            try:
                with urllib.request.urlopen(request, timeout=1800) as response:
                    glb = response.read(MAX_GLB + 1)
            except urllib.error.HTTPError as exc:
                self.failure(502, "Hunyuan3D returned HTTP " + str(exc.code))
                return
            except Exception as exc:
                self.failure(503, "Hunyuan3D generation failed: " + type(exc).__name__)
                return
            if not 20 <= len(glb) <= MAX_GLB or glb[:4] != b"glTF":
                self.failure(502, "Hunyuan3D did not generate a valid bounded GLB")
                return
            self.respond(200, glb, "model/gltf-binary")
        finally:
            LOCK.release()

    def log_message(self, format: str, *args: object) -> None:
        # No prompts, model contents, or image data in logs.
        print("[ASCENSION Hunyuan Local] " + (format % args), flush=True)


if __name__ == "__main__":
    print("ASCENSION local Hunyuan browser bridge on 127.0.0.1:8082; origin restricted", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever(poll_interval=0.5)
