# ASCENSION V1 repair — implementation record (October 30, 2026)

This is an implementation record, **not owner acceptance**. No checkboxes in the approved owner checklist have been marked complete. Changes are confined to `repair/v1-pathway-entry-20261029`. The production/main branch remains untouched.

## Implemented on repair branch
- Existing Tree + Book scene retained. Spoken Knowledgeverse welcome invokes browser text-to-speech on page entry, with first user-action fallback if autoplay is blocked. No emergence overlay or written welcome banner.
- Initial objective analysis remains entirely in the backend as input to pathway generation. The user-facing intermediate essay or shortened initial answer is not shown.
- Three distinct pathway choices and the fourth blend remain. Pictures are requested only when a pathway is selected, not on all four cards.
- The chosen pathway exposes DESCRIPTION and clickable LABELS, and entry actions for BLUEPRINT and DISSECT/EXPLODE. Part labels use the selected pathway's actual names, purposes and stated locations, not fabricated mesh coordinates.
- The existing reality viewer remains the underlying view implementation. CAD, Environment and Simulation are not added to the V1 pathway selector.
- A damaged governed delivery module was restored byte-for-byte from the `recovery/ascension-v1-20261028-2222` GitHub ref.
- Preserved already-completed answers on repeat polling and prioritized a substantive transported design over a generic receipt.
- Repaired pre-existing standalone inference, storage, and image module syntax so the production bundle can compile.
- Image requests are eligible only for an explicitly owner-configured free/approved ASCENSION image endpoint; no paid image generator has been silently enabled. The endpoint must return real PNG, JPEG or WebP base64.
- The existing inference adapter now supports its prior string and structured-result call contracts. Free OpenRouter fallback is forced to zero-price and zero-data-retention settings, and no Z.AI or Lovable inference endpoint is invoked.

## Follow-on repairs during today's working session
- Added a live, contextual Tree question flow for the chosen pathway and inside the reality viewer. Browser speech recognition supports spoken questions when available; typed questions remain accessible. Answers are generated from the specific objective and selected design through the already-enabled OpenAI Responses adapter, with voice playback when sound is enabled. This is real handler and UI code, **not yet verified in a running browser with an API key**.
- Clicking a selected part in the V1 dissection's side list now gives its name, purpose and stated location to the Tree for speech. The original pathway's parts take precedence over ungrounded inferred 2D anchor labels; the V1 viewer does not make new image-to-mesh claims from those labels.
- Revised internal first-answer research to produce a substantive invention engineering brief, not a user-facing essay or instructions to ask the owner for specifications. The entire brief remains private input to the three-pathway-plus-blend generator.
- The V1 build and focused contract regression tests have passed after the latest changes. No production deployment or owner signoff occurred.

## Owner-design-only corrections
- Removed the unapproved experimental concept geometry provider, preview renderer and related test entirely. Original selected-path image generation only; no invented substitute pictures, meshes, diagrams or providers.
- Restored the original persistent Tree background by activating the existing 'data-realities' scene logic on results and reusing the same approved artwork faintly in V1 inspection.
- Removed the result 'eruption' trigger. The approved Tree-and-Book image is visible from entry; it only powers up while working.
- V1 inspection no longer exposes the legacy NEW ANSWERS or ambient volume/sound controls. The Tree's spoken guidance remains accessible.
- Selected-path picture requests first check the server's existing image capability. With no approved bridge connected, the screen reports this directly instead of spamming failed image-generation requests.
- Railway production HTTP and deployment logs from October 29–30 show successful initial/pathway response requests, but selected-picture requests fail HTTP 503 because the ASCENSION image service is not configured; production variables confirm no ASCENSION_IMAGE_ENDPOINT. This blocks source-based invention artwork and 3D reconstruction.
- No main branch modifications or owner approval marks.

## Verification and blockers
- GitHub Actions on the repair branch successfully built the client and server bundle, and the 10 focused V1 static contract checks passed. The final workflow check was green (commit b3703b05); these checks do not constitute live browser acceptance.
- The legacy `tests/interface.test.mjs` suite still **fails** at the obsolete Z.AI streaming expectation. It runs as a visible non-blocking diagnostic in the green V1 workflow, not as a silently passed test. Do not re-enable Z.AI merely to satisfy that old contract. Browser acceptance and actual runtime/image-source verification remain open.
- The live Railway environment currently exposes OpenAI text keys but has no configured ASCENSION image endpoint or autonomous governed runtime bridge. Subject-specific concept pictures, technical dimensions, and source-derived 3D dissect/explode cannot be accepted as working until their actual generation/reconstruction source succeeds.
- No false images, assumed measurements, or supposed finished 3D have been substituted. No deployment to main/production has been made.

## Owner acceptance
The source of truth remains `docs/ASCENSION_V1_OWNER_APPROVAL_CHECKLIST.md`. **All owner approval checkboxes remain unchecked.** Do not merge or deploy these repairs without the owner's approval.
