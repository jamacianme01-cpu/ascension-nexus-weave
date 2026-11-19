#!/usr/bin/env python3
"""Read-only core assessment after one harmless guest submission to the existing owner queue.

Never creates substitute pathways, modifies ASCENSION_CORE, or reports verification
when the actual engine did not complete the queued objective.
"""
import http.client
import json
import os
import sys
import time
import uuid

token = os.environ.get("ASCENSION_PUBLISH_TOKEN", "")
if not token:
    raise SystemExit("Owner worker has no ASCENSION_PUBLISH_TOKEN")

def rpc(path, body):
    connection = http.client.HTTPConnection("::1", 9091, timeout=25)
    raw = json.dumps(body, separators=(",", ":")).encode()
    connection.request("POST", path, body=raw, headers={
        "Content-Type": "application/json",
        "x-ascension-publish-token": token,
    })
    response = connection.getresponse()
    value = response.read(300000)
    connection.close()
    if response.status != 200:
        raise RuntimeError("Owner transport " + path + " returned HTTP " +
                           str(response.status) + " " + value.decode(errors="replace")[:300])
    return json.loads(value)

objective = "Explain electrical resistance and one practical use in a brief factual answer."
request = rpc("/guest/submit", {"objective": objective})
request_id = str(uuid.UUID(request["request"]["id"]))
guest_token = request["guestToken"]
print("OWNER_LIVE_OBJECTIVE_SUBMITTED", request_id, flush=True)
deadline = time.monotonic() + 240
last_status = None
while time.monotonic() < deadline:
    state = rpc("/guest/bundle", {"requestId": request_id, "guestToken": guest_token})
    run = state.get("run")
    if not run:
        raise SystemExit("Owner transport lost its own submitted objective")
    status = run.get("status")
    if status != last_status:
        print("OWNER_OBJECTIVE_STATUS", str(status), "stage", str(run.get("stage")), flush=True)
        last_status = status
    if status in ("verified", "failed", "rejected"):
        result = run.get("result") if isinstance(run.get("result"), dict) else {}
        authored = next((r for r in (
            result.get("objective_delivery"), result.get("delivery"),
            result.get("response_payload"), result,
        ) if isinstance(r, dict) and isinstance(r.get("pathways"), list)), {})
        pathways = authored.get("pathways", [])
        blend = authored.get("blend") if isinstance(authored.get("blend"), dict) else None
        diagnostics = {
            "status": status,
            "stage": run.get("stage"),
            "error": str(run.get("error") or "")[:400],
            "result_top_level_keys": sorted(result.keys())[:28],
            "artifact_names": [f.get("name") for f in state.get("artifacts", []) if isinstance(f, dict)],
            "authored_pathways": len(pathways),
            "authored_blend": bool(blend and blend.get("blend_reason")),
            "valid_four_delivered": len(pathways) == 3 and bool(blend and blend.get("blend_reason")),
        }
        print("OWNER_REAL_OBJECTIVE_REPORT " + json.dumps(diagnostics), flush=True)
        if status != "verified":
            raise SystemExit("ASCENSION owner worker did not verify the test objective")
        if not diagnostics["valid_four_delivered"]:
            raise SystemExit("ASCENSION owner worker completed but did not author the required four V1 pathways")
        print("ASCENSION_V1_REAL_FOUR_PATHWAY_DELIVERY_VERIFIED", flush=True)
        sys.exit(0)
    time.sleep(5)
raise SystemExit("ASCENSION owner worker timed out without completing its real objective")
