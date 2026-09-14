# ASCENSION web layer — roadmap

## Open
- [ ] Replace the expired/invalid Z.AI credential (`ZAI_API_KEY`) through the secure secret form, then re-run request `27199e50-9b13-488d-b140-22554a12cc72` to prove the `user_result` stage completes. Blocked on the owner entering a valid key.
- [ ] Report production deployment status for `b9ca9651-c0e1-454c-9b90-6cec818ac92f` (no deployment-status tool available to this session).

## Done
- [x] Diagnosed Z.AI HTTP 401: endpoint `https://api.z.ai/api/paas/v4` and model `glm-4.6` are correct and reachable; the stored credential is rejected (`token expired or incorrect`) and is only 11 characters long, i.e. truncated or a placeholder.
- [x] Restricted `ascension_relay_documents` so no browser client can read it directly; public replay stays served by the app's server route.
