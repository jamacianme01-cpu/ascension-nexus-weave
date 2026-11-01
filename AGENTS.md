- Both existing ENVISION and RealityViewer consume canonical-assembly geometry, extracted from the historical ENVISION renderer, so semantic specs and known-subject fallbacks stay consistent without claiming physical verification; unknown subjects use named interpretive diagram points only.
- Keep the dedicated Three.js workbench; automatically upgrade to a delivered GLB only when the current assembly is unedited, otherwise require an explicit replacement to preserve edits.


## Canonical Public-Product Contract (October 2026)

- ASCENSION's public ENGAGE and free exploration must work from hosted infrastructure 24/7; it must **not** require the owner's Windows machine, local Ollama, a Hunyuan worker, or a persistent desktop queue worker for ordinary questions.
- Cloud answer providers are transport for unverified language output, not replacements for the CLARITY/ASCENSION governed architecture. Runtime execution, Guardian, AutoSync, evidence, and earned Delta retain their existing proof boundaries.
- Public exploration should give useful answers, multiple substantive Spiral pathways where appropriate, saved continuation/blending, and existing previews **before any sales pressure**. Do not re-add an upfront answer paywall.
- Ordinary answer inference defaults to the currently configured **zero-token-charge** cloud routes (OpenRouter free with zero-data-retention filters); never silently substitute a billed provider/model or turn on paid image generation.
- Free routes are usage-limited and not a production SLA. Add server-side per-user quotas, fraud controls, authenticated usage/accounting and owner-approved premium computing **before** large-scale public launch; do not claim this work is finished.
- Local models remain optional for development and specialty execution, not the default public-answer architecture. No generic SaaS dashboards, replacement architecture, fake simulation, pretend verification, or placeholder 3D offered as real.

## Cursor Cloud specific instructions

- Install dependencies with `npm install`. `npm ci` fails on the current lockfile because `package-lock.json` does not match `package.json`.
- Start the web app with `npm run dev`. Vite listens on port 3000 and already sets `host: true`. `GET /api/health` should return `{"status":"ok","service":"ascension-web","scope":"web_server_only"}`.
- Public ENGAGE does not need Ollama, a desktop worker, or a paid model. Without an inference key, submitting an objective returns the provider configuration error and does not fabricate an answer.
