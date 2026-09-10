#!/usr/bin/env node
/**
 * ASCENSION Observation Gateway → hosted relay push.
 *
 * Run this on the machine where the governed runtime and its Observation
 * Gateway live. It performs documented GET reads only, and forwards each
 * response BYTE-FOR-BYTE to the published site's secured relay endpoint, so
 * the internet-reachable console shows your real LIVE_GOVERNED state with the
 * snapshot hash still verifiable in the browser.
 *
 * It never writes to the governed core and never alters an observation value.
 *
 * Usage (PowerShell):
 *   $env:ASCENSION_PUBLISH_TOKEN="<token>"
 *   node scripts/ascension-relay-push.mjs
 *
 * Options (environment variables):
 *   ASCENSION_GATEWAY_URL   default http://localhost:8765
 *   ASCENSION_RELAY_URL     default https://ascensionweave.app/api/public/ascension/relay
 *   ASCENSION_PUSH_INTERVAL seconds; when set, keeps pushing on that interval
 */

const GATEWAY = (process.env.ASCENSION_GATEWAY_URL ?? "http://localhost:8765").replace(/\/+$/, "");
const RELAY = (
  process.env.ASCENSION_RELAY_URL ?? "https://ascensionweave.app/api/public/ascension/relay"
).replace(/\/+$/, "");
const TOKEN = process.env.ASCENSION_PUBLISH_TOKEN;
const INTERVAL = Number(process.env.ASCENSION_PUSH_INTERVAL ?? 0);

const PATHS = [
  "/snapshot",
  "/status",
  "/chamber",
  "/knowledgeverse",
  "/pathways",
  "/governance",
  "/outcomes",
  "/galaxy-bridges",
  "/manifestation",
  "/ledger",
];

if (!TOKEN) {
  console.error("ASCENSION_PUBLISH_TOKEN is not set. Nothing pushed.");
  process.exit(1);
}

async function readDocument(path) {
  const response = await fetch(`${GATEWAY}/api/ascension/v1${path}`, { method: "GET" });
  if (!response.ok && response.status !== 503) {
    throw new Error(`gateway HTTP ${response.status} for ${path}`);
  }
  return { text: await response.text(), status: response.status };
}

async function pushOnce() {
  const documents = {};
  const libraryCards = [];
  for (const path of PATHS) {
    documents[path] = await readDocument(path);
  }

  let revision = null;
  let classification = null;
  try {
    const snapshot = JSON.parse(documents["/snapshot"].text);
    revision = snapshot?.content?.snapshot_revision ?? null;
    classification = snapshot?.content?.publication_provenance?.source_classification ?? null;
    for (const form of snapshot?.content?.knowledge_forms ?? []) {
      if (typeof form?.entity_id === "string") libraryCards.push(form.entity_id);
    }
  } catch {
    // The relay stores what the gateway returned; it does not require parsing.
  }

  for (const entityId of libraryCards.slice(0, 40)) {
    const path = `/library-card/${encodeURIComponent(entityId)}`;
    documents[path] = await readDocument(path);
  }

  const response = await fetch(RELAY, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ascension-publish-token": TOKEN },
    body: JSON.stringify({
      revision,
      source_classification: classification,
      documents,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`relay HTTP ${response.status}: ${body}`);
  console.log(
    `pushed revision ${revision ?? "unknown"} (${Object.keys(documents).length} documents) → ${RELAY}`,
  );
}

async function main() {
  await pushOnce();
  if (INTERVAL > 0) {
    setInterval(() => {
      pushOnce().catch((error) => console.error("push failed:", error.message));
    }, INTERVAL * 1000);
  }
}

main().catch((error) => {
  console.error("push failed:", error.message);
  process.exit(1);
});
