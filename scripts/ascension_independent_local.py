#!/usr/bin/env python3
"""Private independent ASCENSION interface; uses the existing signed core intake."""
import argparse
from datetime import datetime, timezone
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import threading
from urllib.error import HTTPError, URLError
from urllib.parse import unquote
from urllib.request import Request, urlopen
import webbrowser

HOST = "127.0.0.1"
PORT = 4175
INTAKE = "http://127.0.0.1:8790/api/ascension/intake/v1"
GATEWAY = "http://127.0.0.1:8765/api/ascension/v1"

PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ASCENSION · Independent Hub</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;color:#e9e6db;font-family:Segoe UI,Arial,sans-serif;background:radial-gradient(ellipse at 50% 15%,#183e48,#081018 65%);}
main{max-width:850px;margin:auto;padding:70px 22px 90px;}header{text-align:center;margin-bottom:55px}
small{letter-spacing:.3em;color:#bfa874}h1{font:normal clamp(46px,9vw,85px) Georgia,serif;letter-spacing:.14em;margin:18px 0}
.sub{font-size:12px;letter-spacing:.25em;color:#90b4b8}.panel{border:1px solid #4e7373;background:#101e27e8;border-radius:18px;padding:32px;margin-top:22px;box-shadow:0 20px 65px #0008}
h2{font:normal 26px Georgia,serif;text-align:center;color:#e6d4b7}textarea{width:100%;min-height:150px;resize:vertical;background:#060e14;color:#fff;border:1px solid #436b70;border-radius:10px;padding:17px;font:16px/1.5 Segoe UI,Arial,sans-serif}
button{display:block;margin:22px auto 0;border:1px solid #dbc08a;border-radius:9px;background:linear-gradient(#d2b578,#947347);color:#071018;cursor:pointer;padding:17px 27px;font-weight:bold;letter-spacing:.22em}
button:disabled{opacity:.5}.info{text-align:center;color:#aec5c9;font-size:12px;line-height:1.8;margin:16px 0}
#result{display:none}pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #315258;padding:16px;background:#070f17;border-radius:10px;font:12px/1.6 Consolas,monospace;max-height:450px;overflow:auto}
.path{border:1px solid #587577;background:#0b1b24;padding:14px;margin:10px 0;border-radius:9px}footer{text-align:center;color:#789a9f;font-size:11px;margin-top:32px;line-height:1.9}
</style></head><body><main><header><small>EVERYTHING IS CONNECTED</small><h1>ASCENSION</h1><div class="sub">KNOWLEDGE · CREATION · EVOLUTION</div></header>
<section class="panel"><h2>What do you want to accomplish?</h2><textarea id="objective" aria-label="Objective" placeholder="Enter your objective in your own words"></textarea><button id="go">ENGAGE ASCENSION</button><div class="info" id="health">Connecting to your existing ASCENSION engines…</div></section>
<section id="result" class="panel" aria-live="polite"><h2>RESULT</h2><div class="info" id="status"></div><div id="pathways"></div><pre id="output"></pre></section>
<footer>LOCAL ASCENSION CORE · NO LOVABLE · NO Z.AI<br>Governed verification is never assumed or invented.</footer></main><script>
const csrf="__CSRF__",el=id=>document.getElementById(id);let poller=null;const done=new Set(["PERSISTED","FAILED","REJECTED","VERIFIED_UNPUBLISHED","BLOCKED_TRANSACTION_RECOVERY"]);
async function get(path,init){let r=await fetch(path,{cache:"no-store",...init});let d=await r.json();if(!r.ok)throw Error(d.error||"HTTP "+r.status);return d}
async function health(){try{let d=await get("/api/health");el("health").textContent=(d.intake?"REAL OBJECTIVE INTAKE READY":"Starting the objective intake")+" · "+(d.gateway?"GOVERNED SNAPSHOT AVAILABLE":"Observation gateway unavailable")+(d.clarity_engine_package?" · CLARITY ENGINES FOUND":" · ENGINE DEPENDENCY MISSING: clarity");}catch(e){el("health").textContent=e.message}}health();setInterval(health,12000)
function show(d){el("result").style.display="block";el("status").textContent="REAL ASCENSION STATUS: "+d.status+" · "+d.request_id;
let p=d.result?.objective_planning;let b=p?.branches;el("pathways").replaceChildren();if(Array.isArray(b))for(const branch of b){let item=document.createElement("div");item.className="path";item.textContent=branch.title||branch.label||branch.branch_id||JSON.stringify(branch);el("pathways").append(item)}
const history=Array.isArray(d.history)?d.history:[];const note=[...history].reverse().find(x=>x&&typeof x.note==="string"&&x.note.trim())?.note;
if(d.result)el("output").textContent=(note?"Last runtime note: "+note+"\n\n":"")+JSON.stringify(d.result,null,2);
else if(done.has(d.status))el("output").textContent="The actual ASCENSION runtime STOPPED. No verified result was produced.\n\n"+(note||"No failure reason was recorded.")+"\n\n"+JSON.stringify(history,null,2);
else el("output").textContent="Processing with the existing governed engines.\n"+(note||"No verified result reported yet.");}
async function status(id){try{let d=await get("/api/run-status/"+encodeURIComponent(id));show(d);if(done.has(d.status)){clearInterval(poller);poller=null;el("go").disabled=false;el("go").textContent="ENGAGE ASCENSION";return true}return false}catch(e){el("status").textContent=e.message;return false}}
el("go").onclick=async()=>{let objective=el("objective").value.trim();if(!objective)return;el("go").disabled=true;el("go").textContent="ENGAGING…";if(poller)clearInterval(poller);
try{let d=await get("/api/engage",{method:"POST",headers:{"content-type":"application/json","x-ascension-ui-csrf":csrf},body:JSON.stringify({objective})});el("objective").value="";const finished=await status(d.request_id);if(!finished)poller=setInterval(()=>status(d.request_id),2500)}
catch(e){el("go").disabled=false;el("go").textContent="ENGAGE ASCENSION";el("result").style.display="block";el("status").textContent="NOT SUBMITTED: "+e.message;el("output").textContent="No result was produced."}};
get("/api/last-run").then(show).catch(()=>{});
</script></body></html>"""

def json_get(url, timeout=3):
    with urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))

def start_existing(url, cmd, repo):
    try:
        json_get(url, 2)
        return
    except (OSError, URLError, HTTPError, TimeoutError, ValueError):
        pass
    # Never change or kill ASCENSION engine processes.
    subprocess.Popen(cmd, cwd=str(repo), stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    for _ in range(20):
        time.sleep(.3)
        try:
            json_get(url, 2)
            return
        except (OSError, URLError, HTTPError, TimeoutError, ValueError):
            continue

def serve(repo, port, browser=True):
    sys.path.insert(0, str(repo))
    from ASCENSION_CORE.objective_intake import OperatorCredential
    from ASCENSION_CORE.publication_contract import canonical
    root=repo/"ASCENSION_CORE"/"state"/"live"
    if not (repo/"ASCENSION_CORE"/"objective_intake.py").is_file():
        raise FileNotFoundError("ASCENSION_CORE is missing at "+str(repo))
    credential=OperatorCredential(root)
    csrf=secrets.token_hex(32)
    start_existing(INTAKE+"/health",[sys.executable,"-B","-m","ASCENSION_CORE.objective_intake","--root",str(root)],repo)
    start_existing(GATEWAY+"/snapshot",[sys.executable,"-B","-m","ASCENSION_CORE.observation_gateway","--publication-dir",str(root/"published"),"--knowledgeverse-id","KV:ascension-live","--cache-dir",str(Path(os.getenv("LOCALAPPDATA",str(repo)))/"ASCENSION"/"ObservationCache"),"--port","8765"],repo)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def send_json(self,code,obj):
            raw=json.dumps(obj).encode("utf-8")
            self.send_response(code)
            for name,val in {"Content-Type":"application/json; charset=utf-8","Content-Length":str(len(raw)),"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}.items():self.send_header(name,val)
            self.end_headers();self.wfile.write(raw)
        def allowed(self):
            if self.headers.get("Host") != f"127.0.0.1:{port}":
                self.send_json(403,{"error":"Local browser only"});return False
            return True
        def do_GET(self):
            if not self.allowed():return
            path=self.path.split("?",1)[0]
            if path=="/":
                raw=PAGE.replace("__CSRF__",csrf).encode("utf-8")
                self.send_response(200);self.send_header("Content-Type","text/html; charset=utf-8");self.send_header("Content-Length",str(len(raw)));self.send_header("Cache-Control","no-store");self.send_header("X-Frame-Options","DENY");self.send_header("Content-Security-Policy","default-src 'self' 'unsafe-inline'; frame-ancestors 'none'");self.end_headers();self.wfile.write(raw)
            elif path=="/api/health":
                try:intake=json_get(INTAKE+"/health",2).get("status")=="available"
                except (OSError,URLError,HTTPError,TimeoutError,ValueError):intake=False
                try:gateway=json_get(GATEWAY+"/snapshot",3).get("availability") in ("available","last_verified")
                except (OSError,URLError,HTTPError,TimeoutError,ValueError):gateway=False
                try:
                    import importlib.util
                    clarity=importlib.util.find_spec("clarity") is not None
                except (ImportError,ValueError):
                    clarity=False
                self.send_json(200,{"intake":intake,"gateway":gateway,"clarity_engine_package":clarity})
            elif path=="/api/last-run":
                from ASCENSION_CORE.objective_intake import IntakeStore
                records=IntakeStore(root).all_requests()
                if not records: return self.send_json(404,{"error":"no earlier requests"})
                latest=max(records,key=lambda r:r.get("updated_at",""))
                self.send_json(200,{k:latest.get(k) for k in ("request_id","status","history","result")})
            elif path.startswith("/api/run-status/"):
                rid=unquote(path.removeprefix("/api/run-status/"))
                if not rid.startswith("REQ:") or len(rid)>70:return self.send_json(400,{"error":"Invalid run ID"})
                try:self.send_json(200,json_get(INTAKE+"/run-status/"+rid,5))
                except (OSError,URLError,HTTPError,TimeoutError,ValueError) as e:self.send_json(502,{"error":"Core status unavailable: "+str(e)[:180]})
            else:self.send_json(404,{"error":"Not found"})
        def do_POST(self):
            if not self.allowed():return
            if self.path!="/api/engage":return self.send_json(404,{"error":"Not found"})
            if self.headers.get("Origin")!=f"http://127.0.0.1:{port}" or not hmac.compare_digest(self.headers.get("x-ascension-ui-csrf",""),csrf):
                return self.send_json(403,{"error":"Local session required"})
            try:
                length=int(self.headers.get("Content-Length","0"))
                if length<1 or length>8000:return self.send_json(413,{"error":"Invalid size"})
                data=json.loads(self.rfile.read(length).decode("utf-8"))
                objective=data.get("objective") if isinstance(data,dict) else None
                if not isinstance(objective,str) or not objective.strip() or len(objective)>4000:return self.send_json(400,{"error":"Objective required"})
                body={"objective":objective,"evidence":[],"constraints":[]}
                ts=datetime.now(timezone.utc).isoformat();nonce=secrets.token_urlsafe(18)
                signature=credential.sign(body,ts,nonce)
                request=Request(INTAKE+"/execute",data=canonical(body).encode("utf-8"),method="POST",headers={"Content-Type":"application/json","X-ASCENSION-Timestamp":ts,"X-ASCENSION-Nonce":nonce,"X-ASCENSION-Signature":signature})
                with urlopen(request,timeout=12) as reply:result=json.loads(reply.read().decode("utf-8"))
                self.send_json(201,{"request_id":result["request_id"],"status":result["status"]})
            except HTTPError as e:self.send_json(502,{"error":"Governed intake HTTP "+str(e.code)+": "+e.read(512).decode("utf-8","replace")})
            except (OSError,URLError,TimeoutError,KeyError,ValueError) as e:self.send_json(502,{"error":"Core intake unavailable: "+str(e)[:180]})
        def do_OPTIONS(self):self.send_json(405,{"error":"Not allowed"})
    server=ThreadingHTTPServer((HOST,port),Handler)
    url=f"http://127.0.0.1:{port}/"
    print("INDEPENDENT ASCENSION:",url,flush=True)
    print("The existing ASCENSION_CORE governs every objective. Local browser only.",flush=True)
    if browser:threading.Timer(.5,lambda:webbrowser.open(url)).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--repo",default=str(Path.home()/"Projects"/"clarity"))
    parser.add_argument("--port",type=int,default=PORT)
    parser.add_argument("--no-browser",action="store_true")
    args=parser.parse_args()
    serve(Path(args.repo).resolve(),args.port,not args.no_browser)
