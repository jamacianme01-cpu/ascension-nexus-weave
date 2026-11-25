import assert from "node:assert/strict";
import { shouldAcceptRelayRevision, governedQueueTransition } from "../src/lib/ascension/data/relay-queue-safety.mjs";

// Old retries cannot roll back or replace the latest accepted publication.
assert.equal(shouldAcceptRelayRevision(null, 12), true);
assert.equal(shouldAcceptRelayRevision(12, 13), true);
assert.equal(shouldAcceptRelayRevision(13, 12), false);
assert.equal(shouldAcceptRelayRevision(13, 13), false);
assert.equal(shouldAcceptRelayRevision(13, NaN), false);
assert.equal(shouldAcceptRelayRevision(13, -1), false);
assert.equal(shouldAcceptRelayRevision(13, 14.5), false);

// A terminal result is immutable. An identical retry is acknowledged only.
assert.equal(governedQueueTransition("queued", "verified"), "conflict");
assert.equal(governedQueueTransition("claimed", "running"), "updated");
assert.equal(governedQueueTransition("running", "verified"), "updated");
assert.equal(governedQueueTransition("claimed", "failed"), "updated");
assert.equal(governedQueueTransition("running", "claimed"), "conflict");
assert.equal(governedQueueTransition("verified", "verified"), "replayed");
assert.equal(governedQueueTransition("verified", "failed"), "conflict");
assert.equal(governedQueueTransition("failed", "verified"), "conflict");
assert.equal(governedQueueTransition("rejected", "rejected"), "replayed");
assert.equal(governedQueueTransition(undefined, "verified"), "missing");
assert.equal(governedQueueTransition("claimed", "invented_status"), "conflict");
console.log("PASS: ASCENSION stale relay and terminal queue safety invariants");
