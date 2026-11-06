"""Verify the localhost adapter can start and answer CORS preflight without a GPU."""
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

script = Path(__file__).resolve().parents[1] / "runtime_bridge" / "hunyuan_browser_bridge.py"
with socket.socket() as candidate:
    try:
        candidate.bind(("127.0.0.1", 8082))
    except OSError as exc:
        raise RuntimeError("Port 8082 already in use in the test environment") from exc

proc = subprocess.Popen(
    [sys.executable, "-B", "-u", str(script)],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)
origin = "http://127.0.0.1:3000"
try:
    for _ in range(45):
        if proc.poll() is not None:
            out, err = proc.communicate(timeout=2)
            raise RuntimeError(f"Browser adapter exited {proc.returncode}:\n{out}\n{err}")
        try:
            request = urllib.request.Request(
                "http://127.0.0.1:8082/status",
                headers={"Origin": origin, "Host": "127.0.0.1:8082"},
            )
            with urllib.request.urlopen(request, timeout=1) as response:
                status = response.status
                body = response.read()
            break
        except urllib.error.HTTPError as error:
            if error.code == 503:
                status = error.code
                body = error.read()
                break
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.1)
    else:
        raise RuntimeError("Hunyuan browser adapter failed to bind 8082")
    assert status in (200, 503), status
    assert b'"engine": "Hunyuan3D"' in body
    print(f"PASS localhost bridge listens on 8082 and returns Hunyuan status {status}")
    request = urllib.request.Request(
        "http://127.0.0.1:8082/generate",
        method="OPTIONS",
        headers={
            "Origin": origin,
            "Host": "127.0.0.1:8082",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    with urllib.request.urlopen(request, timeout=3) as response:
        assert response.status == 204, response.status
        assert response.headers.get("Access-Control-Allow-Origin") == origin
        assert response.headers.get("Access-Control-Allow-Private-Network") == "true"
    print("PASS same-machine origin can preflight against localhost bridge")
    denied = urllib.request.Request(
        "http://127.0.0.1:8082/generate",
        method="OPTIONS",
        headers={
            "Origin": "https://ascensionweave.app",
            "Host": "127.0.0.1:8082",
            "Access-Control-Request-Method": "POST",
        },
    )
    try:
        urllib.request.urlopen(denied, timeout=3)
        raise RuntimeError("Remote site origin was accepted by the same-machine bridge")
    except urllib.error.HTTPError as error:
        assert error.code == 403, error.code
    print("PASS remote site origin is refused unless ASCENSION_BROWSER_ORIGINS adds it")
finally:
    proc.terminate()
    try:
        proc.communicate(timeout=4)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate(timeout=4)
