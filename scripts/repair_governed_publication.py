#!/usr/bin/env python3
"""One-time privacy repair of an already VERIFIED ASCENSION publication.

Validates original canonical governed publication before altering anything.
Redacts only unsafe local path values, reissues a privacy-safe publication
with an increased publication revision, preserves the governed runtime
revision/delta/source-state hashes, and saves originals outside the
public publication directory. Never alters core engine implementations.
"""
from __future__ import annotations

import argparse
import copy
import os
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timezone


def redaction_paths(original, safe, trail=()):
    """Only allow actual path-string redactions; reject all other changes."""
    if isinstance(original, dict):
        if not isinstance(safe, dict) or original.keys() != safe.keys():
            raise ValueError("Unexpected change to public record fields")
        found = []
        for key in original:
            found += redaction_paths(original[key], safe[key], trail + (key,))
        return found
    if isinstance(original, list):
        if not isinstance(safe, list) or len(original) != len(safe):
            raise ValueError("Unexpected change to publication arrays")
        found = []
        for index, (a, b) in enumerate(zip(original, safe)):
            found += redaction_paths(a, b, trail + (str(index),))
        return found
    if original == safe:
        return []
    if trail and trail[-1] == "path" and isinstance(original, str) and safe is None:
        return ["/".join(trail)]
    raise ValueError("Non-path data would change at " + "/".join(trail))


def archive(path, data):
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError("Backup file collision; aborting")
        return
    with path.open("xb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(Path.home() / "Projects" / "clarity"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    sys.path.insert(0, str(root))

    from ASCENSION_CORE.observation_gateway import (
        ObservationGateway, public_value, read_stable, decode,
    )
    from ASCENSION_CORE.live_publication import LivePublicationStore
    from ASCENSION_CORE.publication_contract import content_hash, validate_publication

    published = root / "ASCENSION_CORE" / "state" / "live" / "published"
    store = LivePublicationStore(published)
    raw = read_stable(store.path)
    original = validate_publication(decode(raw))
    if original["content"]["knowledgeverse_id"] != "KV:ascension-live":
        raise ValueError("Unexpected Knowledgeverse ID; refusing repair")

    safe_content = public_value(copy.deepcopy(original["content"]))
    paths = redaction_paths(original["content"], safe_content)
    if not paths:
        print("NO REPAIR NEEDED: publication is already public-safe")
        with tempfile.TemporaryDirectory(prefix="ascension-observation-check-") as cache:
            snap = ObservationGateway(published, "KV:ascension-live", cache).snapshot()
        print("GATEWAY STATUS:", snap["availability"], snap["error"])
        return 0 if snap["availability"] == "available" else 1

    candidate = copy.deepcopy(original)
    candidate["content"] = safe_content
    candidate["publication_revision"] = original["publication_revision"] + 1
    candidate["published_at"] = datetime.now(timezone.utc).isoformat()
    candidate["content_hash"] = content_hash(safe_content)
    candidate["publication_id"] = "PUB:" + candidate["content_hash"][7:]
    candidate["envelope_hash"] = content_hash({
        k: v for k, v in candidate.items() if k != "envelope_hash"
    })
    validate_publication(candidate)
    if public_value(candidate) != candidate:
        raise ValueError("Candidate still contains unsafe content")
    if (candidate["content"]["runtime"]["revision"] != original["content"]["runtime"]["revision"]
            or candidate["latest_verified_delta_ref"] != original["latest_verified_delta_ref"]
            or candidate["source_state_hashes"] != original["source_state_hashes"]):
        raise ValueError("Governed proof references changed; aborting")

    print("ORIGINAL PUBLICATION REVISION:", original["publication_revision"])
    print("GOVERNED RUNTIME REVISION:", original["content"]["runtime"]["revision"], "(unchanged)")
    print("PRIVATE PATH VALUES TO REDACT:", len(paths))
    print("SAFE PUBLICATION REVISION:", candidate["publication_revision"])
    if not args.apply:
        print("DRY RUN: nothing was changed. Use --apply to repair.")
        return 0

    backups = published.parent / "publication_repair_backups"
    backups.mkdir(parents=True, exist_ok=True)
    original_backup = backups / (
        f"governed_state.rev{original['publication_revision']}."
        f"{original['content_hash'][7:19]}.json"
    )
    archive(original_backup, raw)
    if store.previous_path.exists():
        prior_raw = read_stable(store.previous_path)
        prior = validate_publication(decode(prior_raw))
        archive(
            backups / (f"governed_state.rev{prior['publication_revision']}."
                       f"{prior['content_hash'][7:19]}.json"),
            prior_raw,
        )
    if read_stable(store.path) != raw:
        raise ValueError("Publication changed during repair; refusing overwrite")

    try:
        store._atomic(store.previous_path, original)
        store._atomic(store.path, candidate)
        with tempfile.TemporaryDirectory(prefix="ascension-observation-check-") as cache:
            snapshot = ObservationGateway(published, "KV:ascension-live", cache).snapshot()
        if snapshot["availability"] != "available" or snapshot["snapshot_hash"] is None:
            raise ValueError("Post-repair gateway validation failed: " + str(snapshot["error"]))
    except Exception:
        try:
            if decode(read_stable(store.path)) == candidate:
                store._atomic(store.path, original)
        except Exception:
            print("WARNING: check publication backup for manual rollback", file=sys.stderr)
        raise

    print("SUCCESS: HTTP 200-capable governed observation snapshot verified")
    print("ORIGINAL BACKUP:", original_backup)
    print("No engines, governed source state, Guardian or AutoSync results were changed")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"REPAIR BLOCKED: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
