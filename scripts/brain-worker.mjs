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
      const response = await fetch(local + "/api/public/ascension/independent", {
        method: "POST",
        headers: { "content-type": "application/json", "origin": local },
        body: JSON.stringify(job.input),
        signal: AbortSignal.timeout(100_000),
      });
      status = response.status;
      const raw = await response.text();
      if (raw.length > 12_800_000) throw new Error("Old-PC result exceeded relay size limit.");
      try { body = JSON.parse(raw); }
      catch { body = { error: "Old-PC engine returned invalid JSON." }; status = 502; }
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
while (running) {
  try {
    const job = await poll();
    if (job) {
      await deliver(job);
      process.stdout.write("ASCENSION brain: request processed on this computer.\n");
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
