import { createPublicKey, verify } from "node:crypto";

/** Matches ASCENSION_CORE.publication_contract.canonical (sorted JSON keys).
 * Only JSON data types are accepted; canonical JSON is signed by the core.
 */
export function canonicalReport(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Nonfinite attested number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalReport).join(",") + "]";
  if (typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ":" + canonicalReport(value[key])
    ).join(",") + "}";
  }
  throw new Error("Invalid attested JSON value");
}

export function governedReportMessage(report) {
  if (!report || typeof report !== "object" || Array.isArray(report) ||
      typeof report.core_signed_payload !== "string" ||
      report.core_signed_payload.length > 1500000)
    throw new Error("Invalid governed report");
  // The original Python core signs the exact serialized JSON payload bytes.
  // The web never attempts to reproduce Python's number formatting.
  return Buffer.from("ASCENSION-GOVERNED-REPORT-V1\n" + report.core_signed_payload);
}

export function verifyGovernedReport(report, publicKeyPem) {
  if (!publicKeyPem || !report?.core_attestation ||
      typeof report.core_attestation !== "string" ||
      !/^[A-Za-z0-9+/]{86}==$/.test(report.core_attestation))
    return false;
  try {
    const { core_attestation, core_signed_payload, ...fields } = report;
    const signedFields = JSON.parse(core_signed_payload);
    if (canonicalReport(signedFields) !== canonicalReport(fields))
      return false;
    const signature = Buffer.from(core_attestation, "base64");
    const key = createPublicKey(publicKeyPem);
    return key.asymmetricKeyType === "ed25519" && signature.length === 64 &&
      verify(null, governedReportMessage(report), key, signature);
  } catch {
    return false;
  }
}
