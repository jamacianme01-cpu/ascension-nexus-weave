import assert from "node:assert/strict";
import {
  modelStorageObjectPath, modelUploadSignature, verifyModelUploadSignature,
} from "../src/lib/ascension/data/model-storage-signature.mjs";

const secret = "a".repeat(96);
const item = "ascension-models/3e8b99e7-cba9-40a7-b593-617c84f12da8/55c64f31-26b0-4776-bbf8-fb78801c991f.glb";
const expires = Date.now() + 2 * 60 * 60 * 1000;
const signature = modelUploadSignature(item, expires, secret);
assert.equal(signature.length, 64);
assert.equal(verifyModelUploadSignature(item, expires, signature, secret), true);
assert.equal(verifyModelUploadSignature(item, expires, signature, "b".repeat(96)), false);
assert.equal(verifyModelUploadSignature(item, expires - 7200001, signature, secret), false);
assert.equal(verifyModelUploadSignature(item.replace(".glb", ".png"), expires, signature, secret), false);
assert.equal(verifyModelUploadSignature(item.replace("ascension-models", "other"), expires, signature, secret), false);
for (const illegal of [
  "ascension-models/../secret.png",
  "ascension-models//foo.png",
  "ascension-models/owner/%2e%2e/secret.glb",
  "ascension-models/owner/a.svg",
  "ascension-models/owner/a.png/../../a.png",
]) assert.equal(modelStorageObjectPath(illegal), null);
console.log("PASS: ASCENSION owner model signatures, expiry, and path restrictions");
