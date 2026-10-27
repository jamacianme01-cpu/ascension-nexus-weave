"""Paired ASCENSION old-PC hub. Uses existing governed engines and Observation Gateway.
Outbound HTTPS only. No legacy publish token, public local port, or fake answers.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

SURFACES = ("/snapshot","/status","/knowledgeverse","/pathways",
            "/governance","/outcomes","/galaxy-bridges","/manifestation",
            "/ledger","/chamber")
SITE = "https://ascensionweave.app"

def observe(gateway, path):
    req=Request(gateway+"/api/ascension/v1"+path,headers={"accept":"application/json"})
    with urlopen(req,timeout=20) as response:
        return {"text":response.read().decode("utf-8"),"status":response.status}

def relay_observations(gateway, key):
    documents={p:observe(gateway,p) for p in SURFACES}
    snap=json.loads(documents["/snapshot"]["text"])
    if snap.get("availability") not in ("available","last_verified") or not snap.get("snapshot_hash"):
        raise RuntimeError("Real governed snapshot unavailable; not relaying unverified state")
    content=snap.get("content") or {}
    for form in (content.get("knowledge_forms") or [])[:40]:
        entity=form.get("entity_id") if isinstance(form,dict) else None
        if isinstance(entity,str) and entity:
            path="/library-card/"+quote(entity,safe="")
            documents[path]=observe(gateway,path)
    raw=json.dumps({
        "revision":content.get("snapshot_revision"),
        "source_classification":(content.get("publication_provenance") or {}).get("source_classification"),
        "documents":documents,
    },ensure_ascii=False).encode("utf-8")
    req=Request(SITE+"/api/public/ascension/relay",method="POST",data=raw,headers={
        "content-type":"application/json","x-ascension-hub-key":key,
    })
    with urlopen(req,timeout=30) as response:
        ack=json.loads(response.read().decode("utf-8"))
    if ack.get("ok") is not True:
        raise RuntimeError("Hosted observation relay rejected publication")
    # Byte-identical readback preserves browser-side snapshot hash validity.
    with urlopen(SITE+"/api/public/ascension/v1/snapshot",timeout=30) as response:
        readback=response.read().decode("utf-8")
    if readback!=documents["/snapshot"]["text"]:
        raise RuntimeError("Hosted readback differs from local governed snapshot")
    return content.get("snapshot_revision")

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root",required=True)
    parser.add_argument("--once",action="store_true")
    parser.add_argument("--gateway",default="http://127.0.0.1:8765")
    args=parser.parse_args()
    key=os.environ.get("ASCENSION_HUB_KEY","").strip().lower()
    if len(key)!=96 or any(c not in "0123456789abcdef" for c in key):
        raise ValueError("A 48-byte paired hub key is required")
    root=Path(args.root).resolve()
    sys.path.insert(0,str(root))
    from ASCENSION_CORE.cloud_queue_worker import QueueClient,CloudQueueWorker
    # Reuse the existing proved cloud queue worker without editing its engine
    # semantics. Its compatibility header transports the NEW paired device key.
    client=QueueClient(SITE+"/api/public/ascension/execution-queue",key,socket.gethostname())
    worker=CloudQueueWorker(root/"ASCENSION_CORE"/"state"/"live",client)
    next_push=0.0
    while True:
        if time.monotonic()>=next_push:
            try:
                revision=relay_observations(args.gateway.rstrip("/"),key)
                print("WEB SNAPSHOT VERIFIED: revision",revision,flush=True)
            except (RuntimeError,ValueError,HTTPError,URLError,OSError) as exc:
                print("Observation not connected:",str(exc)[:300],flush=True)
            next_push=time.monotonic()+60
        try:
            result=worker.run_once()
            if result is not None:
                print("GOVERNED OBJECTIVE:",json.dumps(result,sort_keys=True),flush=True)
            elif args.once:
                print("HUB IDLE: no queued objective",flush=True)
        except (RuntimeError,ValueError,HTTPError,URLError,OSError) as exc:
            print("Objective queue unavailable:",str(exc)[:300],flush=True)
            if args.once:return 1
        if args.once:return 0
        time.sleep(3)
if __name__=="__main__":
    raise SystemExit(main())
