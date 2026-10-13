# ASCENSION independent hosting transition

This branch prepares ASCENSION's existing TanStack Start app for a normal Node.js/Nitro deployment. **Do not replace the production domain until the independent environment passes live checks.**

## Target

Use a GitHub-connected Node application service (Railway or equivalent), running `npm run build` and `npm start` (`node .output/server/index.mjs`). No Lovable deploy or paid Lovable AI is required. Do not enable `ASCENSION_ALLOW_LOVABLE_AI`.

## Runtime variables (configure in the host dashboard; NEVER commit secrets)

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for server access.
- `SUPABASE_PUBLISHABLE_KEY` and build-time `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` for browser auth.
- `ZAI_API_KEY` or `OPENROUTER_API_KEY` for a cloud inference provider; both have availability/rate limits. A dedicated private backend provider can replace these in a later step.
- `HOST=0.0.0.0`; the platform supplies `PORT`.
- Other required secrets should be inventoried from the existing deployment and configured privately.

## Acceptance gates

1. GitHub branch CI: interface tests, production build, TypeScript.
2. Start generated Node server on an external preview URL.
3. Verify auth, original objectives, history, saved pathways and library data on that URL.
4. Verify `Make worker drones` returns three useful pathways and a blend without the model provider timing out; verify images and GLB separately rather than equating a text answer with a creation.
5. Verify Guardian, AutoSync, evidence and persistence have appropriate independent statuses.
6. Configure the custom domain and TLS only after the independent host is proven. Keep rollback to the previous domain routing.

## Data and ownership caution

The code already talks directly to Supabase; changing web hosts does **not** move its database or remove dependence on its current project ownership. Before leaving Lovable Cloud entirely, confirm independent administrative control, obtain a database backup, check auth redirects and storage policies, and arrange any needed migration. Do not disclose a service role key to the browser.

This is a hosting transition, not an excuse to rename ASCENSION's concepts or rebuild the Book, Tree, knowledge, or governed engines.
