"""Generate and transport ASCENSION's three distinct outcome versions + one blend.

This is an adapter registry, not a music-app-specific routine. Only real,
available capability adapters may create artifacts. Other output domains remain
UNAVAILABLE until a matching executor is integrated. This never changes
Guardian/AutoSync core results and never invents four created outputs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SITE = "https://ascensionweave.app/api/public/ascension/output-versions"


def request_json(url: str, key: str, body: dict | None = None) -> dict:
    headers = {"x-ascension-hub-key": key, "accept": "application/json"}
    kwargs = {}
    if body is not None:
        headers["content-type"] = "application/json"
        kwargs["data"] = json.dumps(body).encode("utf-8")
        kwargs["method"] = "POST"
    req = Request(url, headers=headers, **kwargs)
    try:
        with urlopen(req, timeout=50) as response:
            value = json.load(response)
    except HTTPError as exc:
        raise RuntimeError("Hosted output-version endpoint returned HTTP " +
                           str(exc.code) + ": " + exc.read(250).decode("utf-8", "replace")) from exc
    if not isinstance(value, dict):
        raise ValueError("Invalid hosted output-version response")
    return value


def safe_text(value: object, limit: int = 3000) -> str:
    return str(value or "").strip()[:limit]


def create_software(root: Path, objective: str, branch: dict, previous: list[dict]) -> dict[str, str]:
    # The local model's generator receives the exact objective plus *this*
    # governed strategy, not a renaming of the same selected output.
    sys.path.insert(0, str(root.resolve()))
    from ASCENSION_CORE.software_project_executor import create_software_artifacts
    strategy = json.dumps({
        "version_id": branch["id"],
        "strategy": branch.get("approach"),
        "actions": branch.get("actions", []),
        "risks": branch.get("risks", []),
        "required_differentiation": "A distinct implementation and interaction approach, not a changed title",
        "avoid_repeating": [v["id"] for v in previous if v.get("status") == "created"],
        "is_blend": branch["kind"] == "blend",
        "blend_from": branch.get("blend_from", []),
    }, ensure_ascii=False)
    return create_software_artifacts(objective, strategy)


ADAPTERS = {
    "software_project": create_software,
}


def make_version(root: Path, objective: str, branch: dict, previous: list[dict]) -> dict:
    cap = safe_text(branch.get("capability"), 120)
    kind = branch["kind"]
    label = safe_text(branch.get("approach") or branch["id"], 160)
    summary = safe_text(" ".join(branch.get("actions", [])) or "Governed approach " + branch["id"], 3000)
    if kind == "blend":
        label = "Blend of three approaches"
        summary = "Combine complementary strengths of the three governed pathways; retain independent verification."
    basic = {
        "id": branch["id"], "kind": kind,
        "label": label or branch["id"], "summary": summary,
        "blend_from": branch.get("blend_from", []),
    }
    adapter = ADAPTERS.get(cap)
    if adapter is None:
        return {
            **basic, "status": "unavailable", "files": [],
            "verification_scope": "No real output-producing executor registered for capability " + cap,
        }
    try:
        files = adapter(root, objective, branch, previous)
        if not isinstance(files, dict) or not files:
            raise ValueError("Executor returned no created output")
        collected = []
        for name, content in files.items():
            if not isinstance(name, str) or not isinstance(content, str) or not content:
                raise ValueError("Executor returned invalid source files")
            raw = content.encode("utf-8")
            collected.append({
                "name": name,
                "content": content,
                "bytes": len(raw),
                "sha256": "sha256:" + hashlib.sha256(raw).hexdigest(),
            })
        primary = next((f for f in collected if f["name"].lower() not in
                        ("readme.md", "verification.json", "metadata.json")), None)
        if not primary:
            raise ValueError("No primary created artifact")
        # Fail closed on identical outputs, not four file sets with different labels.
        old_hashes = {
            item["sha256"] for previous_item in previous
            for item in previous_item.get("files", [])
            if item["name"] == primary["name"]
        }
        if primary["sha256"] in old_hashes:
            raise ValueError("Model repeated an earlier artifact instead of generating a distinct version")
        return {
            **basic,
            "status": "created", "files": collected,
            "verification_scope": "Source files, local syntax and hashes only; functional/browser/physical verification not established",
        }
    except (RuntimeError, ValueError, OSError, KeyError) as exc:
        return {
            **basic, "status": "unavailable", "files": [],
            "verification_scope": "Executor failed to create verified source: " + safe_text(str(exc), 300),
        }


def generate_versions(root: Path, objective: str, branches: list[dict]) -> list[dict]:
    if len(branches) != 3 or len({x.get("id") for x in branches}) != 3:
        raise ValueError("Exactly three distinct governed pathways required")
    cap = {x.get("capability") for x in branches}
    if len(cap) != 1:
        # Mixed capability paths must each be dispatched to the appropriate
        # adapter; BLEND is unavailable if cross-domain execution isn't present.
        blend_cap = "mixed_capability_executor"
    else:
        blend_cap = next(iter(cap))
    blend = {
        "id": "blend",
        "kind": "blend",
        "approach": "Spiral / Outcome Predictor synthesis",
        "actions": [
            f"{branch.get('id')}: " + " | ".join(branch.get("actions", []))
            for branch in branches
        ],
        "capability": blend_cap,
        "blend_from": [branch["id"] for branch in branches],
    }
    stages = [{**branch, "kind": "pathway", "blend_from": []} for branch in branches] + [blend]
    versions: list[dict] = []
    for index, branch in enumerate(stages, 1):
        result = make_version(root, objective, branch, versions)
        versions.append(result)
        print("OUTPUT VERSION", index, result["status"].upper(), branch["id"], flush=True)
    return versions


def publish(root: Path, request_id: str, key: str) -> dict:
    if not key or len(key) != 96:
        raise ValueError("Paired hub credential missing (never print pairing keys)")
    detail = request_json(SITE + "?" + urlencode({"request_id": request_id}), key)
    if detail.get("request_id") != request_id:
        raise ValueError("Hosted version input does not match the requested objective")
    branches = detail.get("branches")
    objective = detail.get("objective")
    if not isinstance(objective, str) or not objective.strip() or not isinstance(branches, list):
        raise ValueError("Hosted output version input incomplete")
    versions = generate_versions(root, objective, branches)
    ack = request_json(SITE, key, {"request_id": request_id, "versions": versions})
    if ack.get("ok") is not True:
        raise RuntimeError("Output versions were not acknowledged by hosting")
    print("FOUR VERSION SLOTS SAVED; CREATED:",
          ack.get("produced_versions"), "/ 4", flush=True)
    return ack


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--request-id", required=True)
    args = parser.parse_args()
    import os
    key = os.environ.get("ASCENSION_HUB_KEY", "").strip()
    try:
        publish(args.root, args.request_id, key)
        return 0
    except (RuntimeError, ValueError, OSError, HTTPError, URLError) as exc:
        print("OUTPUT VERSIONS NOT VERIFIED:", str(exc)[:350], file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
