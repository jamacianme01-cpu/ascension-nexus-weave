import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

// This is the owner's EXACT approved full composition, not a Tree crop.
const approved = path.resolve("public/approved-scene/ascension-exact-approved-scene.png");
const bytes = readFileSync(approved);
const expectedSHA256 = "cba074376cdb684e7286392f55e6bb95abdb37192325bdd9e3e37bc6d8c73495";
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  expectedSHA256,
  "The approved ASCENSION image has been removed or altered; never substitute another picture.",
);
assert.equal(bytes.readUInt32BE(16), 1672, "Approved scene width must remain unchanged.");
assert.equal(bytes.readUInt32BE(20), 941, "Approved scene height must remain unchanged.");
console.log("PASS: exact owner-approved full image, no crop or substitution");
