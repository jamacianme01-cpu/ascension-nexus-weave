"""ASCENSION local Hunyuan3D model worker.

Polls the secured web model queue, rasterizes each pathway's SVG reference
visual locally, sends the PNG to the already-running Hunyuan3D API, uploads
the returned GLB through a short-lived signed upload URL, and reports
completion. No cloud service can call localhost; this process is the bridge.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_QUEUE_URL = "https://ascension-nexus-weave.lovable.app/api/public/ascension/model-queue"
DEFAULT_HUNYUAN_URL = "http://127.0.0.1:8081/generate"


def _token() -> str:
    value = os.environ.get("ASCENSION_PUBLISH_TOKEN", "").strip()
    if not value:
        raise RuntimeError("ASCENSION_PUBLISH_TOKEN is not set")
    return value


def _json_request(url: str, token: str, method: str = "GET", payload=None, timeout: int = 60):
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {
        "accept": "application/json",
        "x-ascension-publish-token": token,
        # Lovable's public edge rejects some bare Python urllib clients before
        # the request reaches our route. Present a normal browser-compatible UA.
        "user-agent": "Mozilla/5.0 ASCENSION-Hunyuan-Worker/1.0",
        "cache-control": "no-cache",
    }
    if body is not None:
        headers["content-type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(
            "queue HTTP " + str(exc.code) + " from " + url + ": " + detail[:1200]
        ) from exc


def _browser() -> str:
    candidates = [
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError("Microsoft Edge or Google Chrome was not found for SVG rasterization")


def _svg_to_png(svg: str, work: Path) -> Path:
    svg_path = work / "reference.svg"
    png_path = work / "reference.png"
    svg_path.write_text(svg, encoding="utf-8")
    command = [
        _browser(),
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--default-background-color=FFFFFFFF",
        "--window-size=1024,1024",
        "--screenshot=" + str(png_path),
        svg_path.resolve().as_uri(),
    ]
    completed = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=90,
    )
    if completed.returncode != 0 or not png_path.is_file() or png_path.stat().st_size < 100:
        raise RuntimeError("SVG rasterization failed: " + completed.stdout[-1200:])
    return png_path


def _generate_glb(hunyuan_url: str, png_path: Path) -> bytes:
    image64 = base64.b64encode(png_path.read_bytes()).decode("ascii")
    body = json.dumps({"image": image64}, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(
        hunyuan_url,
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "accept": "model/gltf-binary,application/octet-stream",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=1800) as response:
            data = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(
            "Hunyuan3D HTTP " + str(exc.code) + ": " + detail[:1500]
        ) from exc
    if len(data) < 20 or data[:4] != b"glTF":
        raise RuntimeError("Hunyuan3D did not return a valid binary GLB")
    return data


def _upload_glb(signed_url: str, glb: bytes) -> None:
    req = urllib.request.Request(
        signed_url,
        data=glb,
        method="PUT",
        headers={
            "content-type": "model/gltf-binary",
            "cache-control": "max-age=31536000",
            "x-upsert": "true",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(
                    "signed upload returned HTTP " + str(response.status)
                )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(
            "signed GLB upload failed HTTP " + str(exc.code) + ": " + detail[:1500]
        ) from exc


def _report(
    queue_url: str,
    token: str,
    job_id: str,
    status: str,
    error: str | None = None,
):
    payload = {"job_id": job_id, "status": status}
    if error:
        payload["error"] = error[:4000]
    return _json_request(queue_url, token, "POST", payload, 60)


def run_once(queue_url: str, hunyuan_url: str, token: str, runner: str) -> bool:
    separator = "&" if "?" in queue_url else "?"
    claim_url = queue_url + separator + urllib.parse.urlencode({"runner": runner})
    payload = _json_request(claim_url, token, "GET", None, 60)
    item = payload.get("item")
    if not item:
        return False

    job_id = str(item.get("id") or "")
    visual_svg = item.get("visual_svg")
    upload_url = item.get("upload_url")
    label = str(item.get("label") or item.get("pathway_id") or job_id)
    if not job_id or not isinstance(visual_svg, str) or not isinstance(upload_url, str):
        if job_id:
            _report(queue_url, token, job_id, "failed", "Model queue item was incomplete.")
        return True

    print("[Hunyuan] claimed " + job_id + " | " + label, flush=True)
    try:
        _report(queue_url, token, job_id, "running")
        with tempfile.TemporaryDirectory(prefix="ascension-hunyuan-") as temp:
            png_path = _svg_to_png(visual_svg, Path(temp))
            glb = _generate_glb(hunyuan_url, png_path)
            _upload_glb(upload_url, glb)
        result = _report(queue_url, token, job_id, "completed")
        print(
            "[Hunyuan] completed "
            + job_id
            + " | "
            + str(len(glb))
            + " bytes | "
            + str(result.get("model_url") or ""),
            flush=True,
        )
    except Exception as exc:
        message = str(exc)
        print("[Hunyuan] FAILED " + job_id + " | " + message, flush=True)
        try:
            _report(queue_url, token, job_id, "failed", message)
        except Exception as report_exc:
            print(
                "[Hunyuan] could not report failure: " + str(report_exc),
                flush=True,
            )
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue-url", default=DEFAULT_QUEUE_URL)
    parser.add_argument("--hunyuan-url", default=DEFAULT_HUNYUAN_URL)
    parser.add_argument("--runner", default=socket.gethostname() + "-hunyuan")
    parser.add_argument("--poll-seconds", type=float, default=3.0)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    token = _token()
    print("[Hunyuan] ASCENSION model worker online", flush=True)
    while True:
        try:
            worked = run_once(
                args.queue_url,
                args.hunyuan_url,
                token,
                args.runner,
            )
        except Exception as exc:
            worked = False
            print("[Hunyuan] queue error: " + str(exc), flush=True)
        if args.once:
            return 0
        if not worked:
            time.sleep(max(1.0, args.poll_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
