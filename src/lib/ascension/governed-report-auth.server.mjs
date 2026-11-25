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
  if (!report || typeof report !== "object" || Array.isArray(report))
    throw new Error("Invalid governed report");
  const { core_attestation, ...content } = report;
  // Domain separation prevents a signature for a different purpose being
  // accepted as a queue completion, even with the same key.
  return Buffer.from("ASCENSION-GOVERNED-REPORT-V1\n" + canonicalReport(content));
}

export function verifyGovernedReport(report, publicKeyPem) {
  if (!publicKeyPem || !report?.core_attestation ||
      typeof report.core_attestation !== "string" ||
      !/^[A-Za-z0-9+/]{86}==$/.test(report.core_attestation))
    return false;
  try {
    const signature = Buffer.from(report.core_attestation, "base64");
    const key = createPublicKey(publicKeyPem);
    return key.asymmetricKeyType === "ed25519" && signature.length === 64 &&
      verify(null, governedReportMessage(report), key, signature);
  } catch {
    return false;
  }
}
