# ASCENSION — Persistent intent-crystal growth

## Approved behavior

- The **Book is the Library Card**.
- The **Tree is the knowledge container**. It holds one crystal for each continuing intent.
- The owner's approved **cosmic-black groundskeeper** stays present, speaks, explains, interacts and offers suggestions.
- A crystal reveals **only actual governed results**. Blueprint/dissection/rotation require delivered images or 3D models.
- The crystal's visible growth is tied to **real persisted verified revisions**, not a fake progress counter.
- **No four-pathway chooser**, no additional hosted platform and no old-computer connection.

## Persistence

A Library Card capability maps to its owner-specific file under the **existing persistent** `ASCENSION_STORAGE_DIR/intent-crystals/` directory; files are named with SHA-256 of the opaque capability, not the user's name or intent. Ledger records preserve the latest run, previous verified answer, a bounded history of verified revisions, and the last automatic queue time.

These records are written atomically with a shared per-file lock used by **both** the owner-governed background worker and user-driven updates. A return visit can retrieve the previous verified result **while another run is pending**. The UI does not invent development when an engine is unavailable.

**Identity limitation:** The current Library Card capability is held in one browser's local storage. This is **not secure cross-device account authentication**, and transferring between devices is not yet implemented. The existing session module provides no functioning account sign-in.

## Background cycle

The app uses its **existing server process**; it does **not** start a new runtime or select any external service.

The cycle becomes eligible only when the running server has:
- `ASCENSION_STORAGE_DIR` set to an absolute, durable mounted path.
- Either its existing `ASCENSION_VOLUME_TRANSPORT_URL` **and** `ASCENSION_PUBLISH_TOKEN`, or its existing PostgreSQL `DATABASE_URL` / `ASCENSION_DATABASE_URL`.
- The owner's actual governed queue worker processing requests.
- `ASCENSION_ENABLE_CRYSTAL_EVOLUTION` not set to `false`. Setting it to `false` is an explicit emergency stop.

It checks after startup (about 30 seconds), then every 30 minutes **while the server process remains running**. Each cycle queues at most two continuations and each intent is eligible only after at least 12 hours since the prior verified completion and last automatic queue time. Only a verified, persisted, genuinely delivered result is eligible. It uses the original authorized run and preserves approved specifications. A submitted continuation is not considered a discovery.

This does **not** itself provision a continuously running host, enable a missing worker, set secrets, activate any paid model, or perform deployment. Without a running configured server, **the intent cannot develop while the browser is closed**.

## Verification and release boundary

Run `npm run test:interface`, `npm run build`, and `npx tsc --noEmit`. Passes establish code correctness, **not** deployment or end-to-end knowledge growth.

Before asserting that continuous development is live:
1. Confirm a host under the owner's control has durable `ASCENSION_STORAGE_DIR` and the original governed runtime reachable without the retired Fly/old-PC paths.
2. Confirm a submitted intent has a verified persisted delivery and the crystal ledger contains that record.
3. Leave the browser closed through an eligible evolution cycle.
4. Confirm a new governed request was queued by the process, later verified and persisted; confirm the same crystal retains the prior verified answer while its next run processes.
5. Reopen the Library Card in the same authorized browser. The new verified result and history must appear, with no fake result, missing model, or substituted groundskeeper.

**Artwork still missing from the repo** as of the implementation branch: `public/approved-scene/ascension-approved-cosmic-groundskeeper.png` and `public/approved-scene/ascension-knowledge-tree-crystals.png`. The UI must not replace them with lookalikes. The approved visuals are a separate release prerequisite.
