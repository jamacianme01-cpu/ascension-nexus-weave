"""Constrained, local-model software artifact generator for ASCENSION.

Creates a single-file offline browser app from the EXACT requested objective,
then checks generated JavaScript syntax with Node without executing the app.
This is source generation + syntax verification, NOT a browser acceptance test,
deployment, or proof that every requested feature works.
"""
from __future__ import annotations

import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API = "http://127.0.0.1:11434"
DEFAULT_MODEL = "qwen2.5-coder:3b"
MAX_BYTES = 350_000
RESTRICTED_TARGETS = frozenset({
    "ios", "iphone", "ipad", "android", "native", "desktop",
    "backend", "database", "server", "postgres", "firebase",
    "flutter", "react-native", "electron", "windows-exe", "apk",
})


def supports_browser_app(objective: str) -> bool:
    """Fail closed on deliverables requiring other execution capabilities."""
    words = set(re.findall(r"[a-z0-9-]+", str(objective).lower()))
    return bool(words & {"app", "application", "website", "webapp", "web", "browser", "game", "code"}) \
        and not bool(words & RESTRICTED_TARGETS)


def model_name() -> str:
    return os.environ.get("ASCENSION_SOFTWARE_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def preflight() -> tuple[bool, str]:
    if not shutil.which("node"):
        return False, "Node.js is required for JavaScript syntax checks."
    try:
        req = Request(API + "/api/tags", headers={"Accept": "application/json"})
        with urlopen(req, timeout=4) as response:
            data = json.load(response)
    except (OSError, HTTPError, URLError, ValueError) as exc:
        return False, "Local Ollama is unreachable: " + type(exc).__name__
    names = {str(v.get("name", "")).lower() for v in data.get("models", []) if isinstance(v, dict)}
    if model_name().lower() not in names:
        return False, "Coding model is not installed: " + model_name()
    return True, "local coding model and Node syntax checker available"


class _AppHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags: set[str] = set()
        self.bad_tags: set[str] = set()
        self.remote_assets: list[str] = []
        self.js: list[str] = []
        self._in_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tags.add(tag)
        attributes = dict(attrs)
        if tag in {"iframe", "object", "embed", "form"}:
            self.bad_tags.add(tag)
        if tag == "script":
            if attributes.get("src"):
                self.remote_assets.append("script[src]")
            self._in_script = not bool(attributes.get("src"))
        for key in ("src", "href", "action"):
            value = str(attributes.get(key) or "").strip().lower()
            if value.startswith(("http:", "https:", "//", "javascript:")):
                self.remote_assets.append(tag + "[" + key + "]")

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self._in_script = False

    def handle_data(self, data: str) -> None:
        if self._in_script:
            self.js.append(data)


def verify_offline_app(html: str) -> dict[str, Any]:
    if not isinstance(html, str) or len(html.encode("utf-8")) < 750:
        raise ValueError("No substantive HTML application was generated")
    if len(html.encode("utf-8")) > MAX_BYTES:
        raise ValueError("Generated HTML exceeds the size limit")
    parser = _AppHTML()
    parser.feed(html)
    if not {"html", "head", "title", "body", "script"}.issubset(parser.tags):
        raise ValueError("Generated result is not a complete HTML application")
    if not ({"button", "input", "canvas", "select", "textarea"} & parser.tags):
        raise ValueError("Generated result has no interactive controls")
    if parser.bad_tags or parser.remote_assets:
        raise ValueError("Generated app attempted unsupported embedded or external resources")
    if re.search(r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\s*\(", html):
        raise ValueError("Offline app attempted an external network operation")
    js = "\n".join(parser.js).strip()
    if len(js) < 120:
        raise ValueError("Generated app has no substantive JavaScript")
    if not re.search(r"addEventListener|on(?:click|change|input|submit)\s*=", html):
        raise ValueError("Generated app has no detectable interactive behavior")

    with tempfile.TemporaryDirectory(prefix="ascension-js-check-") as stage:
        candidate = Path(stage) / "generated.mjs"
        candidate.write_text(js, encoding="utf-8")
        try:
            result = subprocess.run(
                ["node", "--check", str(candidate)],
                capture_output=True, text=True, timeout=15, check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError("JavaScript syntax checker unavailable") from exc
        if result.returncode != 0:
            raise ValueError("Generated app has JavaScript syntax errors: " + result.stderr[:350])
    return {
        "scope": "offline HTML structure, prohibited external resources, and Node JavaScript syntax only",
        "functional_browser_tested": False,
        "sha256": hashlib.sha256(html.encode("utf-8")).hexdigest(),
        "bytes": len(html.encode("utf-8")),
        "checker": "node --check",
    }


def _call_ollama(objective: str, branch_id: str) -> str:
    system = (
        "Produce an actual runnable, single-page, OFFLINE browser app, not a description. "
        'Reply ONLY as JSON {"index_html":"<full complete HTML>"} without markdown. '
        "Include complete inline CSS and JavaScript, visible interface, user interactions, "
        "working client-side behavior and accessible labels. No placeholders, TODOs, "
        "remote assets, network requests, forms that submit to a server, or external scripts. "
        "For music apps, provide original Web Audio synthesis or interactive sequencing. "
        "Do not assert that the app was tested, deployed, or verified. "
        "Treat the user request as a deliverable, not a request for planning."
    )
    body = {
        "model": model_name(),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": "EXACT OBJECTIVE:\n" + objective
                                  + "\nASCENSION SELECTED PATHWAY:\n" + branch_id},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.25, "num_predict": 8192},
    }
    req = Request(
        API + "/api/chat",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(req, timeout=180) as response:
            raw = response.read(MAX_BYTES * 4 + 1)
    except (HTTPError, URLError, OSError) as exc:
        raise RuntimeError("Local coding model request failed") from exc
    if len(raw) > MAX_BYTES * 4:
        raise ValueError("Local model response exceeds the maximum accepted size")
    data = json.loads(raw)
    if data.get("done") is False:
        raise RuntimeError("Local model did not complete generation")
    text = data.get("message", {}).get("content", "")
    if not isinstance(text, str):
        raise ValueError("Local model returned no application content")
    response = json.loads(text)
    html = response.get("index_html")
    if not isinstance(html, str):
        raise ValueError("Local model did not return index_html")
    return html


def create_software_artifacts(objective: str, branch_id: str) -> dict[str, str]:
    """Return verified source bytes. Does not execute generated code or modify core."""
    if not supports_browser_app(objective):
        raise ValueError("A single-page offline browser app does not satisfy this output contract")
    ready, reason = preflight()
    if not ready:
        raise RuntimeError("Software executor unavailable: " + reason)
    html = _call_ollama(objective, branch_id)
    verification = verify_offline_app(html)
    # Block all network egress in the generated offline app at browser level.
    csp = ("<meta http-equiv=\"Content-Security-Policy\" "
           "content=\"default-src 'none'; script-src 'unsafe-inline'; "
           "style-src 'unsafe-inline'; img-src data: blob:; "
           "media-src data: blob:; connect-src 'none'; "
           "font-src data:; base-uri 'none'; form-action 'none'\">")
    if not re.search(r"<head(?:\s[^>]*)?>", html, flags=re.I):
        raise ValueError("Generated HTML is missing head")
    html = re.sub(r"(<head(?:\s[^>]*)?>)", lambda m: m.group(1) + "\n" + csp,
                  html, count=1, flags=re.I)
    verification["sha256"] = hashlib.sha256(html.encode("utf-8")).hexdigest()
    verification["bytes"] = len(html.encode("utf-8"))
    readme = (
        "# ASCENSION software artifact\n\n"
        "Objective: " + objective + "\n\n"
        "Selected pathway: " + branch_id + "\n\n"
        "Open index.html in your browser. This artifact runs without remote services.\n\n"
        "Verified: HTML structure, offline resource boundaries and JavaScript syntax.\n"
        "NOT verified: actual browser interactions, features or deployment.\n"
    )
    return {
        "index.html": html,
        "README.md": readme,
        "verification.json": json.dumps(verification, sort_keys=True, indent=2) + "\n",
    }
