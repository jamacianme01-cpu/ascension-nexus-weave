import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  canonicalReport, governedReportMessage, verifyGovernedReport,
} from "../src/lib/ascension/governed-report-auth.server.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" });
const original = {
  status: "verified",
  request_id: "98e40c3d-b272-4ce8-9c63-4d8d4ba2eff1",
  runtime_revision: 44,
  accepted_delta: { K: 1, W: 0, U: 0 },
  result: { transaction: "PERSISTED", autosync_verdict: "VERIFIED" },
};
assert.equal(canonicalReport({z:1,a:{y:2,x:3}}),
  '{"a":{"x":3,"y":2},"z":1}');
const core_signed_payload = JSON.stringify(original);
const signature = sign(null,
  governedReportMessage({ core_signed_payload }), privateKey).toString("base64");
const report = { ...original, core_signed_payload, core_attestation: signature };
assert.equal(verifyGovernedReport(report, pem), true);
assert.equal(verifyGovernedReport(report, undefined), false);
assert.equal(verifyGovernedReport({ ...original }, pem), false);
assert.equal(verifyGovernedReport({
  ...report, core_signed_payload: '{"status":"verified"}',
}, pem), false);
assert.equal(verifyGovernedReport({
  ...report, result: { ...original.result, transaction: "FAILED" },
}, pem), false);
assert.equal(verifyGovernedReport({ ...report, request_id: "different" }, pem), false);
assert.equal(verifyGovernedReport({ ...report, runtime_revision: 45 }, pem), false);
assert.equal(verifyGovernedReport({
  ...report, result: { transaction: "PERSISTED", autosync_verdict: "FAILED" },
}, pem), false);
const stranger = generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"});
assert.equal(verifyGovernedReport(report, stranger), false);
console.log("PASS: report provenance requires an unmodified core-signed payload");
