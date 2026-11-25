import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const privateTransport = readFileSync(
  "scripts/ascension-owner-queue/ascension-volume-transport.py", "utf8");
const guest = readFileSync("src/lib/ascension/guest.functions.ts", "utf8");
assert.match(privateTransport, /def verify_core_attestation\(report\):/);
assert.match(privateTransport, /ASCENSION_CORE_REPORT_PUBLIC_KEY_PEM/);
assert.match(privateTransport, /key\.verify\(signature,/);
assert.match(privateTransport, /if status == 'verified' and not verify_core_attestation\(payload\):/);
assert.match(privateTransport, /run\['result'\]\['core_attestation_verified'\] = True/);
assert.match(privateTransport, /default=os\.environ\.get\('ASCENSION_TRANSPORT_HOST', '127\.0\.0\.1'\)/);
assert.match(guest, /if \(!governedPersisted\(\{/);
assert.match(guest, /signed VERIFIED \/ PERSISTED publication is missing/);
console.log("PASS: private core transport and Tree reject unsigned VERIFIED results");
