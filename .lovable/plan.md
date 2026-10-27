# Deployment diagnostic findings (read-only, no changes made)

1. **Is ascensionweave.app attached to this project?** Yes. ascensionweave.app is connected and set as primary; its A record matches. www.ascensionweave.app is also connected and redirects to it. Both have been connected for about 2.5 days. The project is published.
2. **What's live vs. the editor:** The editor is at `fbeb787` ("prioritize OpenAI on live ASCENSION and recover Z.AI 429 drafts"). The live site serves deployment `bb035e87-d6fd-45e9-9c00-a3baff7cf264`. I can't map that deployment to a commit, so whether `fbeb787` is live is not available. Your Z.AI 429 symptom suggests the live site predates `fbeb787`.
3. **Can live requests read saved secrets?** Yes. Server code reads them at request time. All three names are saved: OPENAI_API_KEY, ASCENSION_ALLOW_OPENAI_AI and ASCENSION_ENABLE_OPENAI_WEB_SEARCH. The code reads them by those exact names. The live site only picks up new or changed secrets after the next publish.
4. **Error logs for "make worker drones" in the last hour:** None found (searched "drone" and "429").
5. **Blocked setup step:** No domain step is blocked. The remaining step is to publish (Publish -> Update) so the live site gets `fbeb787` and the three secrets. ASCENSION_ALLOW_OPENAI_AI must be exactly `true` (lowercase) or OpenAI is skipped.

No action is planned here. Approve only if you want me to stop, or tell me to publish.
