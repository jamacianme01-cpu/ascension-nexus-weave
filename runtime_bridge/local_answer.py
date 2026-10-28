"""Unverified local answer drafting for ASCENSION's outbound queue worker.

This file does not update governed state or claim that an objective was verified.
The local model must produce the requested content; failures stay failures.
"""
from __future__ import annotations

import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_BASE = "http://127.0.0.1:11434/v1"
DEFAULT_MODEL = "qwen3-ascension"


def _kind(objective: str) -> str:
    text = objective.lower().strip()
    if re.match(r"^(how|why|what|when|where|who|which|does|do|is|are|explain|tell me|describe)\b", text):
        return "answer"
    if re.match(r"^can (you|we)\b", text) and not re.search(r"\b(draw|sketch|build|make|create|design|write|generate)\b", text):
        return "answer"
    if re.search(r"\b(draw|drawing|sketch|illustrat\w*|picture|image|diagram|blueprint)\b", text):
        return "drawing"
    if re.search(r"\b(app|application|website|web ?site|program|software|game|tool|bot)\b", text):
        return "app"
    if re.search(r"\b(make|design|invent|build|create|prototype|engineer|develop)\b", text):
        return "design"
    return "answer"


def _visible(text: str) -> str:
    text = re.sub(r"<think>[\s\S]*?(?:</think>|$)", "", text, flags=re.I).strip()
    match = re.fullmatch(r"```(?:html|svg|markdown|md|text)?\s*([\s\S]*?)\s*```", text, flags=re.I)
    return (match.group(1) if match else text).strip()


def _model_response(objective: str, kind: str, evidence: list[str], constraints: list[str]) -> str:
    base = os.getenv("LOCAL_LLM_BASE_URL", DEFAULT_BASE).rstrip("/")
    model = os.getenv("LOCAL_LLM_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if not base.startswith("http://127.0.0.1:") and not base.startswith("http://localhost:"):
        raise RuntimeError("The local model URL must be on this computer")
    mode = {
        "answer": "Answer the question directly with a correct explanation and a useful example. Return plain text.",
        "design": "Produce a concrete design or deliverable in plain text: function, parts/materials, dimensions where justified, assembly or operation, and tests. State assumptions. Do not merely list tokens or a plan to design it.",
        "app": "Create one complete, functional, self-contained HTML application with inline CSS and JavaScript. Return ONLY the full HTML source starting with <!doctype html>. It must perform a useful task related to the objective, not just display the request or a status. No external dependencies and no fake payment processing.",
        "drawing": "Create one complete SVG drawing with actual shapes showing the requested subject. Return ONLY the SVG source starting with <svg. No external assets or generic token diagram.",
    }[kind]
    prompt = "\n".join([
        f"OBJECTIVE: {objective}",
        "EVIDENCE: " + ("; ".join(evidence[:12]) or "none supplied"),
        "CONSTRAINTS: " + ("; ".join(constraints[:12]) or "none supplied"),
        mode,
    ])
    request = Request(
        base + "/chat/completions",
        data=json.dumps({
            "model": model,
            "stream": False,
            "temperature": 0.25,
            "max_tokens": 6144,
            "messages": [
                {"role": "system", "content": "You create the actual requested answer or artifact. Never claim execution, physical construction, testing, ASCENSION verification, or persistence you did not perform. If the request is ambiguous, make clear assumptions and produce the most useful concrete result possible."},
                {"role": "user", "content": prompt},
            ],
        }).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=180) as response:
            payload = json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"local model HTTP {exc.code}") from None
    except URLError as exc:
        raise RuntimeError(f"local model unavailable: {exc.reason}") from None
    choices = payload.get("choices") or []
    if not choices or not isinstance(choices[0], dict):
        raise RuntimeError("local model returned no answer")
    if choices[0].get("finish_reason") == "length":
        raise RuntimeError("local model output was cut off before completion")
    content = choices[0].get("message", {}).get("content")
    if not isinstance(content, str) or not _visible(content):
        raise RuntimeError("local model returned empty visible content")
    return _visible(content)


def generate_local_draft(objective: str, evidence: list[str] | None = None,
                         constraints: list[str] | None = None) -> dict:
    objective = " ".join(objective.split()).strip()
    if not objective:
        raise ValueError("objective is empty")
    kind = _kind(objective)
    content = _model_response(objective, kind, evidence or [], constraints or [])
    files: list[dict[str, str]] = []
    if kind in {"app", "drawing"} and len(content) > 100000:
        raise RuntimeError("local artifact exceeds the source limit; refusing to truncate it")
    if kind == "app":
        if not re.search(r"<!doctype html|<html[\s>]", content, flags=re.I) or not re.search(r"<script[\s>]", content, flags=re.I):
            raise RuntimeError("model did not produce a functional HTML app")
        if not re.search(r"</script\s*>", content, flags=re.I) or not re.search(r"</html\s*>", content, flags=re.I):
            raise RuntimeError("model returned incomplete HTML source")
        files = [{"name": "index.html", "content": content}]
        body = "A browser app draft is ready. Download index.html and open it to try the requested feature. Its behavior has not been independently tested."
        delivery_kind = "artifact"
    elif kind == "drawing":
        if not re.search(r"<svg[\s>]", content, flags=re.I) or not re.search(r"<(path|line|rect|circle|polyline|polygon|ellipse)\b", content, flags=re.I):
            raise RuntimeError("model did not produce a drawing")
        if not re.search(r"</svg\s*>", content, flags=re.I):
            raise RuntimeError("model returned incomplete SVG source")
        files = [{"name": "drawing.svg", "content": content}]
        body = "A draft drawing is ready below. It has not been independently checked against the requested dimensions or design constraints."
        delivery_kind = "artifact"
    else:
        if len(content) < 80 or "this document turns the command" in content.lower():
            raise RuntimeError("model returned a placeholder instead of an answer")
        body = content[:40000]
        delivery_kind = "answer"
    return {
        "kind": delivery_kind,
        "title": objective[:200],
        "body": body,
        "files": files,
        "limitations": ["Local model draft. Check factual claims and test created work before relying on it."],
    }
