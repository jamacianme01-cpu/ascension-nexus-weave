import { createHmac, timingSafeEqual } from "node:crypto";

const BUCKET = "ascension-models";
const ALLOWED_EXTENSIONS = /\.(?:glb|png|webp|jpe?g)$/i;

/** Restrict public and signed storage operations to approved model/image files. */
export function modelStorageObjectPath(input) {
  if (typeof input !== "string" || input.length > 500 || !input.startsWith(BUCKET + "/")) return null;
  const pieces = input.split("/");
  if (pieces.length < 3 || pieces.some(p =>
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(p) || p.includes(".."))) return null;
  if (!ALLOWED_EXTENSIONS.test(pieces.at(-1))) return null;
  return pieces.slice(1).join("/");
}

/** Upload capabilities are bound to an exact path and expiry, never a database or host-wide privilege. */
export function modelUploadSignature(input, expiresAt, secret) {
  if (!modelStorageObjectPath(input) || !Number.isSafeInteger(expiresAt) ||
      expiresAt <= 0 || typeof secret !== "string" || secret.length < 32) return null;
  return createHmac("sha256", secret)
    .update("ASCENSION-MODEL-UPLOAD-V1\n" + input + "\n" + expiresAt)
    .digest("hex");
}

export function verifyModelUploadSignature(input, expiresAt, signature, secret, now = Date.now()) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expires = Number(expiresAt);
  if (!Number.isSafeInteger(expires) || expires <= now ||
      expires > now + 3 * 60 * 60 * 1000) return false;
  const expected = modelUploadSignature(input, expires, secret);
  return !!expected && timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}
