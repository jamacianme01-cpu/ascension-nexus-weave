# ASCENSION web layer — roadmap

## Open
- [ ] Replace the expired/invalid Z.AI credential (`ZAI_API_KEY`) through the secure secret form, then re-run request `27199e50-9b13-488d-b140-22554a12cc72` to prove the `user_result` stage completes. Blocked on the owner entering a valid key.
- [ ] Report production deployment status for `b9ca9651-c0e1-454c-9b90-6cec818ac92f` (no deployment-status tool available to this session).
- [ ] One governed run could not be driven to `verified` from this machine: Supabase requires email confirmation for new accounts (no inbox access here). Owner should run one objective from a signed-in account to confirm the answer panel end to end.

## Done
- [x] Locked the approved opening scene: the real objective field and ENGAGE button now exactly and opaquely cover the controls painted into the artwork, so only ONE field and ONE button are visible; the full chamber image shows at its exact 16:9 aspect with no cropping (verified at 1600×900, 1280×800 and 390×844).
- [x] Replaced the flat SVG line tree with the canonical dimensional Tree of Knowledge artwork: it starts small at the open Book seam and is revealed upward in six stages, roots attached to the pages, with the chamber artwork never replaced.
- [x] Fixed the artifact selection regexes in the governed delivery projection (`\\.` never matched real filenames, so `.md` artifacts could lose priority to `.json` files in the answer body).
- [x] Diagnosed Z.AI HTTP 401: endpoint `https://api.z.ai/api/paas/v4` and model `glm-4.6` are correct and reachable; the stored credential is rejected (`token expired or incorrect`) and is only 11 characters long, i.e. truncated or a placeholder.
- [x] Restricted `ascension_relay_documents` so no browser client can read it directly; public replay stays served by the app's server route.
