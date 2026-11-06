/**
 * ASCENSION older-PC outbound worker. Runs ONLY on the designated brain PC.
 * The Railway site is an interface/transport; requests are executed locally
 * against the same checked-in ASCENSION application and Ollama.
 *
 * No network listener, inbound firewall rule, paid provider or second PC.
 */
const site = (process.env.ASCENSION_BRAIN_SITE ||
  "https://ascension-nexus-weave-production.up.railway.app").replace(/\/+$/, "");
const local = "http://127.0.0.1:" + (process.env.PORT || "8080");
const key = (process.env.ASCENSION_REMOTE_BRAIN_KEY || "").trim();
if (key.length < 48) throw new Error("The older computer is not paired to the ASCENSION site.");
if (!["https://ascension-nexus-weave-production.up.railway.app",
      "https://ascensionweave.app"].includes(site))
  throw new Error("Unapproved remote ASCENSION interface address.");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const headers = { "x-ascension-brain-key": key, "cache-control": "no-store" };
let lastFailure = "";
let running = true;
process.once("SIGINT", () => { running = false; });
process.once("SIGTERM", () => { running = false; });

async function ensureLocalBrain() {
  const response = await fetch(local + "/api/public/ascension/independent",
    { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("ASCENSION local web server is not ready.");
  const capability = await response.json();
  if (!capability.providers?.Local || capability.brain_mode !== "same-computer")
    throw new Error("Refusing to forward objectives: local ASCENSION is not using its own Ollama engine.");
}
async function poll() {
  const response = await fetch(site + "/api/public/ascension/brain-worker",
    { headers, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!response.ok) throw new Error("Cloud bridge unavailable (HTTP " + response.status + ").");
  return (await response.json()).job;
}
async function deliver(job) {
  if (!job || !/^[a-f0-9-]{36}$/.test(job.id) || !job.input ||
      typeof job.input !== "object" || Array.isArray(job.input))
    throw new Error("Malformed ASCENSION job.");
  await ensureLocalBrain();
  let status = 503, body = { error: "The designated old-PC engine did not respond." };
  try {
    const operation = job.input.__brain_operation;
    if (operation === "hunyuan_status" || operation === "hunyuan_generate") {
      // Only the owner's local Hunyuan engine is used. Never connect to a
      // viewer's laptop or the previous second computer.
      const isGenerate = operation === "hunyuan_generate";
      const image = job.input.image;
      if (isGenerate && (typeof image !== "string" || image.length < 4000 ||
          image.length > 12_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image)))
        throw new Error("Invalid Hunyuan reference image.");
      const response = await fetch("http://127.0.0.1:8082/" +
        (isGenerate ? "generate" : "status"), {
        method: isGenerate ? "POST" : "GET",
        headers: { origin: "http://127.0.0.1:8080", ...(isGenerate ? { "content-type": "application/json" } : {}) },
        ...(isGenerate ? { body: JSON.stringify({ image }) } : {}),
        signal: AbortSignal.timeout(isGenerate ? 100_000 : 7_000),
      });
      status = response.status;
      if (isGenerate && response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 20 || bytes.length > 9_000_000 ||
            bytes.subarray(0, 4).toString("utf8") !== "glTF")
          throw new Error("Old-PC Hunyuan returned no bounded GLB.");
        body = { glb_base64: bytes.toString("base64") };
      } else {
        try { body = await response.json(); }
        catch { body = { error: "Old-PC Hunyuan returned unreadable status." }; status = 502; }
      }
    } else {
      const localPathways = job.input.phase === "pathways";
      const response = await fetch(local + "/api/public/ascension/independent", {
        method: "POST",
        headers: { "content-type": "application/json", "origin": local,
          ...(localPathways ? { "prefer": "respond-async" } : {}) },
        body: JSON.stringify(job.input),
        signal: AbortSignal.timeout(100_000),
      });
      status = response.status;
      const raw = await response.text();
      if (raw.length > 12_800_000) throw new Error("Old-PC result exceeded relay size limit.");
      try { body = JSON.parse(raw); }
      catch { body = { error: "Old-PC engine returned invalid JSON." }; status = 502; }
      // A CPU Ollama model may take minutes. Do not keep a single Nitro HTTP
      // request open: poll this very same old PC for its actual answer.
      if (localPathways && status === 202) {
        const id = body?.local_brain_job_id;
        if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
          throw new Error("Local ASCENSION server returned an invalid pathway job ID.");
        let complete = false;
        for (let i = 0; i < 250; i++) {
          await sleep(2000);
          const outcome = await fetch(local +
            "/api/public/ascension/independent?local_brain_job=" +
            encodeURIComponent(id), { signal: AbortSignal.timeout(15_000) });
          status = outcome.status;
          const result = await outcome.text();
          if (result.length > 12_800_000) throw new Error("Local pathway output exceeds maximum relay size.");
          try { body = JSON.parse(result); }
          catch { throw new Error("The old-PC pathway polling response was not JSON."); }
          if (status === 202) continue;
          complete = true;
          break;
        }
        if (!complete) {
          status = 504;
          body = { error: "The old computer did not complete the four pathways within the local generation deadline." };
        }
      }
    }
  } catch (cause) {
    status = 503;
    body = { error: "Old-PC execution failed: " + (cause instanceof Error ? cause.message : String(cause)).slice(0,240) };
  }
  const report = await fetch(site + "/api/public/ascension/brain-worker", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ id: job.id, status, body }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!report.ok) throw new Error("ASCENSION web response delivery failed (HTTP " + report.status + ").");
}

await ensureLocalBrain();
process.stdout.write("ASCENSION old-computer brain: LOCAL ENGINE VERIFIED; outbound web relay starting.\n");
// The previous single await deliver(job) serialized 60-second image requests,
// 20-second Tree replies, and pathway generation. Only two independent jobs
// may run simultaneously to protect this older computer.
const inFlight = new Set();
const MAX_PARALLEL = 2;
while (running) {
  try {
    if (inFlight.size >= MAX_PARALLEL) {
      await Promise.race(inFlight);
      continue;
    }
    const job = await poll();
    if (job) {
      const task = deliver(job).then(() => {
        process.stdout.write("ASCENSION brain: request processed on this computer.\n");
      }).catch((cause) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        process.stderr.write("ASCENSION brain job: " + message.slice(0, 360) + "\n");
      }).finally(() => { inFlight.delete(task); });
      inFlight.add(task);
    } else {
      await sleep(1500);
    }
    lastFailure = "";
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message !== lastFailure) process.stderr.write("ASCENSION brain bridge: " + message + "\n");
    lastFailure = message;
    await sleep(4000);
  }
}
await Promise.allSettled([...inFlight]);
