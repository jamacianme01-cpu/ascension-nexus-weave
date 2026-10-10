# ASCENSION web layer — roadmap

## Open
- [x] Restore canonical ENVISION semantic assemblies and holograms; verify fixture controls on desktop/mobile without new AI objectives.
- [x] Restore and browser-test immediate unverified pathway concept views, dissection, parts, and safe GLB upgrade.
- [ ] Report production deployment status for `b9ca9651-c0e1-454c-9b90-6cec818ac92f` (no deployment-status tool available to this session).
- [ ] One governed run could not be driven to `verified` from this machine: Supabase requires email confirmation for new accounts (no inbox access here). Owner should run one objective from a signed-in account to confirm the answer panel end to end.

## Done
- [x] Installed the three exact approved scene images (`public/approved-scene/`): closed Book hero, open Book, and Tree of Knowledge emergence. The sequence now runs only on these assets: closed hero → Book rocks → crossfade to the approved open Book in the same position → Tree rises from the open pages in six stages → powered-up Tree. Removed every substitute: the CSS-drawn open book, the CSS seam light, the old wide chamber image with painted input, the low-res approved jpgs, and the unreal-book/unreal-tree assets.
- [x] Objective input and ENGAGE ASCENSION now sit below the artwork in normal flow — exactly one field and one button, minimal UI over the scene.
- [x] Plain wording: "ASCENSION RESPONSE" (was "YOUR ANSWER"), "Objective received. Waiting for ASCENSION runtime." (was the governed-queue sentence), "ASCENSION is processing your objective." (was "working on it"), "Proof / verification" (was "Verification details").
- [x] Locked the approved opening scene: the real objective field and ENGAGE button now exactly and opaquely cover the controls painted into the artwork, so only ONE field and ONE button are visible; the full chamber image shows at its exact 16:9 aspect with no cropping (verified at 1600×900, 1280×800 and 390×844).
- [x] Replaced the flat SVG line tree with the canonical dimensional Tree of Knowledge artwork: it starts small at the open Book seam and is revealed upward in six stages, roots attached to the pages, with the chamber artwork never replaced.
- [x] Fixed the artifact selection regexes in the governed delivery projection (`\\.` never matched real filenames, so `.md` artifacts could lose priority to `.json` files in the answer body).
- [x] Diagnosed Z.AI HTTP 401: endpoint `https://api.z.ai/api/paas/v4` and model `glm-4.6` are correct and reachable; the stored credential is rejected (`token expired or incorrect`) and is only 11 characters long, i.e. truncated or a placeholder.
- [x] Restricted `ascension_relay_documents` so no browser client can read it directly; public replay stays served by the app's server route.

## Done (answer path)
- [x] ENGAGE no longer depends on the Windows worker for its immediate user-facing result. The deployed app prefers Lovable's built-in hosted AI gateway through its managed `LOVABLE_API_KEY`; a verified ASCENSION runtime result can still supersede that unverified draft later. Z.AI is opt-in only, and local Ollama is now an explicit local-development fallback only when `LOCAL_LLM_BASE_URL` is set. Provider-routing contract coverage includes the Lovable hosted endpoint and verifies that production routing does not fall back to localhost.
- [ ] Exercise the newly deployed hosted path end-to-end with the three acceptance objectives ("how do you multiply", "make a gel support shoe", "make a quick money making app") and record the returned outputs. Code and deployment are in place; this item stays open until the live server path is actually exercised.
