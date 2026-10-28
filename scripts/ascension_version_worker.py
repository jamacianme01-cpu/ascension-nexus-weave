"""Generate and transport ASCENSION's three distinct outcome versions + one blend.

This is an adapter registry, not a music-app-specific routine. Only real,
available capability adapters may create artifacts. Other output domains remain
UNAVAILABLE until a matching executor is integrated. This never changes
Guardian/AutoSync core results and never invents four created outputs.
"""
from __future__ import annotations

import argparse
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
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
        "original_design_direction": branch.get("direction"),
        "required_differentiation": "A distinct implementation and interaction approach, not a changed title",
        "avoid_repeating": [v["id"] for v in previous if v.get("status") == "created"],
        "is_blend": branch["kind"] == "blend",
        "blend_from": branch.get("blend_from", []),
    }, ensure_ascii=False)
    return create_software_artifacts(objective, strategy)


ADAPTERS = {
    "software_project": create_software,
}


def plan_distinct_directions(objective: str, branches: list[dict]) -> list[dict]:
    """Ask the available local model for differentiated actual result concepts.

    This is EXTERNAL unverified ideation using the governed branch IDs as
    correlation only; never relabel it as Spiral proof or invent missing plans.
    """
    import os
    from urllib.request import Request, urlopen
    model = os.environ.get("ASCENSION_SOFTWARE_MODEL", "qwen2.5-coder:3b").strip()
    system = (
        "You are an objective-divergence planner for the ASCENSION creation engine. "
        "Keep the ORIGINAL objective unchanged. Return JSON only: "
        '{"directions":[{"label":"short distinct title","summary":"what the version does",'
        '"distinctive_interaction":"specific interaction or operating mechanism",'
        '"features":["implemented feature 1","implemented feature 2","implemented feature 3"]},'
        '{"label":"...","summary":"...","distinctive_interaction":"...","features":["..."]},'
        '{"label":"...","summary":"...","distinctive_interaction":"...","features":["..."]}],'
        '"blend":{"label":"...","summary":"...","distinctive_interaction":"...",'
        '"features":["feature from direction 1","feature from direction 2","feature from direction 3"]}}. '
        "All three directions MUST be materially different working implementations "
        "of the user's requested thing, not different documentation styles. "
        "The fourth must combine useful working features from all three."
    )
    req = Request(
        "http://127.0.0.1:11434/api/chat",
        data=json.dumps({
            "model": model, "format": "json", "stream": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps({"objective": objective, "governed_branches": branches})},
            ],
            "options": {"temperature": 0.55, "num_predict": 3200},
        }).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=150) as response:
            response_data = json.load(response)
        plan = json.loads(response_data["message"]["content"])
    except (OSError, HTTPError, URLError, ValueError, KeyError, TypeError) as exc:
        raise RuntimeError("Local variation planner did not return usable options") from exc
    directions = plan.get("directions")
    blend = plan.get("blend")
    if not isinstance(directions, list) or len(directions) != 3 or not isinstance(blend, dict):
        raise ValueError("Local planner did not produce exactly three directions and one blend")
    all_directions = directions + [blend]
    signatures = set()
    for direction in all_directions:
        if not isinstance(direction, dict) or any(not isinstance(direction.get(k), str) or
          not direction.get(k).strip() for k in ("label", "summary", "distinctive_interaction")):
            raise ValueError("Local model returned incomplete version directions")
        features = direction.get("features")
        if not isinstance(features, list) or len(features) < 2 or not all(
            isinstance(f, str) and f.strip() for f in features
        ):
            raise ValueError("Local planner omitted implementation requirements")
        signature = re.sub(r"[^a-z0-9]", "", direction["label"].lower() + direction["distinctive_interaction"].lower())
        if signature in signatures:
            raise ValueError("Local planner repeated a version direction")
        signatures.add(signature)
    return all_directions


def _normalized_code(content: str) -> str:
    # Only an approximation of implementation similarity; browser feature
    # tests are still required and must never be claimed by this checker.
    return re.sub(r"[^a-z0-9]", "", content.lower())[:6000]


def make_version(root: Path, objective: str, branch: dict, previous: list[dict]) -> dict:
    cap = safe_text(branch.get("capability"), 120)
    kind = branch["kind"]
    label = safe_text(branch.get("approach") or branch["id"], 160)
    summary = safe_text(" ".join(branch.get("actions", [])) or "Governed approach " + branch["id"], 3000)
    if kind == "blend":
        label = "Blend of three approaches"
        summary = "Combine complementary strengths of the three governed pathways; retain independent verification."
    direction = branch.get("direction")
    if isinstance(direction, dict):
        label = safe_text(direction.get("label"), 160) or label
        summary = safe_text(direction.get("summary"), 3000) or summary
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
        this_code = _normalized_code(primary["content"])
        for earlier in previous:
            for earlier_file in earlier.get("files", []):
                if earlier_file.get("name") == primary["name"]:
                    other_code = _normalized_code(earlier_file["content"])
                    if other_code and this_code and SequenceMatcher(
                        None, this_code, other_code, autojunk=True
                    ).ratio() > 0.94:
                        raise ValueError("Output is too similar to another version")
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
    if blend_cap == "software_project":
        try:
            directions = plan_distinct_directions(objective, branches)
            for stage, direction in zip(stages, directions):
                stage["direction"] = direction
        except (RuntimeError, ValueError, OSError) as exc:
            reason = "Distinct-version planning unavailable: " + safe_text(str(exc), 200)
            return [{
                "id": stage["id"], "kind": stage["kind"],
                "label": safe_text(stage.get("approach"), 160) or stage["id"],
                "summary": reason, "status": "unavailable", "files": [],
                "verification_scope": reason, "blend_from": stage.get("blend_from", []),
            } for stage in stages]
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
