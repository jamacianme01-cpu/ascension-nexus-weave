"""ASCENSION V1 persistent memory: independent SQLite, private-first, explicit sharing.
No Lovable, Z.AI, or cloud vendor required. This is a storage engine, not the
public sharing service. Cross-user retrieval on the same store only after approval.
"""
from __future__ import annotations
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import re
import sqlite3
from typing import Any

_PRIVATE = re.compile(r"(?i)(?:[A-Z]:\\Users\\|/Users/[^/\s]+/|/home/[^/\s]+/|[\w.+-]+@[\w.-]+\.[a-z]{2,})")
_TERMS = re.compile(r"[a-z0-9]{3,}")
_MAX_TEXT = 5000

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def terms(value: str) -> set[str]:
    return set(_TERMS.findall(value.lower()))

def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

class KnowledgeMemory:
    def __init__(self, file: str | Path):
        self.path = Path(file).expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(self.path), timeout=20)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                source_request_id TEXT NOT NULL,
                source_hash TEXT NOT NULL,
                source_status TEXT NOT NULL,
                objective TEXT NOT NULL,
                pathway_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                steps TEXT NOT NULL,
                components TEXT NOT NULL,
                provenance TEXT NOT NULL,
                sharing_state TEXT NOT NULL DEFAULT 'private'
                  CHECK(sharing_state IN ('private','approved')),
                created_at TEXT NOT NULL,
                approved_at TEXT,
                UNIQUE(owner_id,source_request_id,pathway_id,source_hash)
            );
            CREATE INDEX IF NOT EXISTS memories_visibility
                ON memories(sharing_state,created_at);
            CREATE INDEX IF NOT EXISTS memories_owner
                ON memories(owner_id,created_at);
        """)
    def close(self):
        self.db.close()

    def save(self, *, owner_id: str, source_request_id: str,
             source_status: str, objective: str, pathway: dict[str, Any],
             provenance: dict[str, Any] | None = None) -> dict[str, Any]:
        if not owner_id or len(owner_id)>150 or not source_request_id or len(source_request_id)>150:
            raise ValueError("A real owner and source request ID are required")
        if not isinstance(pathway, dict) or not pathway.get("id") or not pathway.get("summary"):
            raise ValueError("A real pathway ID and explanation are required")
        if not objective.strip():
            raise ValueError("Objective is required")
        if source_status not in ("PERSISTED","REJECTED","FAILED","UNVERIFIED","verified","rejected","failed"):
            raise ValueError("Source status is required; verification cannot be invented")
        title=str(pathway.get("label","")).strip()[:180]
        summary=str(pathway.get("summary","")).strip()[:_MAX_TEXT]
        steps=pathway.get("steps") or []
        components=pathway.get("parts") or []
        if not title or not summary or not isinstance(steps,list) or not isinstance(components,list):
            raise ValueError("Pathway must supply a title and meaningful explanation")
        steps=[str(x)[:600] for x in steps[:40]]
        # Components must be structured information, not fabricated from words.
        components=[x for x in components[:40] if isinstance(x,dict)]
        origin=provenance if isinstance(provenance,dict) else {}
        origin={k:v for k,v in origin.items() if k in (
            "source_classification","verification_status","knowledgeverse_id","snapshot_hash")}
        value={
            "source_request_id":source_request_id,"source_status":source_status,
            "objective":objective[:_MAX_TEXT],"pathway_id":str(pathway["id"])[:180],
            "title":title,"description":summary,"steps":steps,
            "components":components,"provenance":origin,
        }
        digest=hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()
        mid="ME:"+hashlib.sha256((owner_id+"\\0"+digest).encode("utf-8")).hexdigest()[:32]
        self.db.execute("""
          INSERT OR IGNORE INTO memories
           (id,owner_id,source_request_id,source_hash,source_status,objective,
            pathway_id,title,description,steps,components,provenance,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,(mid,owner_id,source_request_id,digest,source_status,value["objective"],
             value["pathway_id"],title,summary,canonical(steps),canonical(components),
             canonical(origin),now()))
        self.db.commit()
        return {"memory_id":mid,"sharing_state":"private","source_hash":"sha256:"+digest}

    def approve_for_reuse(self, memory_id: str, *, owner_id: str) -> bool:
        row=self.db.execute("SELECT * FROM memories WHERE id=? AND owner_id=?",
                            (memory_id,owner_id)).fetchone()
        if row is None: return False
        # Fail closed: never publish hidden machine paths, direct contact details,
        # or a claim of verification unsupported by its stored source status.
        public_content=" ".join((row["objective"],row["title"],row["description"],
                                 row["steps"],row["components"]))
        if _PRIVATE.search(public_content):
            raise ValueError("Sharing blocked: potential private information")
        if row["source_status"]!="PERSISTED":
            raise ValueError("Only persisted governed knowledge can be approved for cross-user reuse")
        with self.db:
            self.db.execute("UPDATE memories SET sharing_state='approved',approved_at=? "
                            "WHERE id=? AND owner_id=?",(now(),memory_id,owner_id))
        return True

    def recall(self, query: str, *, owner_id: str, limit: int=12) -> list[dict[str,Any]]:
        # Private notes are scoped to their creator; shared notes require approval.
        rows=self.db.execute("""
         SELECT * FROM memories WHERE owner_id=? OR sharing_state='approved'
         ORDER BY created_at DESC LIMIT 1500
        """,(owner_id,)).fetchall()
        wanted=terms(query)
        found=[]
        for row in rows:
            detail=" ".join((row["objective"],row["title"],row["description"]))
            matched=len(terms(detail)&wanted)
            if wanted and matched==0:continue
            found.append((matched,{
                "memory_id":row["id"],"title":row["title"],
                "description":row["description"],
                "steps":json.loads(row["steps"]),
                "components":json.loads(row["components"]),
                "source_request_id":row["source_request_id"] if row["owner_id"]==owner_id else None,
                "source_hash":"sha256:"+row["source_hash"],
                "source_status":row["source_status"],
                "sharing_state":row["sharing_state"],
                "owned":row["owner_id"]==owner_id,
                "provenance":json.loads(row["provenance"]),
            }))
        found.sort(key=lambda pair:pair[0],reverse=True)
        return [entry for _,entry in found[:max(0,min(limit,50))]]

if __name__=="__main__":
    import argparse
    ap=argparse.ArgumentParser(description="Independent ASCENSION V1 knowledge memory")
    ap.add_argument("--database",default=str(Path.home()/ "Projects"/"clarity"/"ASCENSION_CORE"/"state"/"live"/"knowledge_memory_v1.sqlite"))
    ap.add_argument("--recall",default="")
    ap.add_argument("--owner",default="local-operator")
    args=ap.parse_args()
    m=KnowledgeMemory(args.database)
    try:
        print(json.dumps(m.recall(args.recall,owner_id=args.owner),indent=2))
    finally:m.close()
