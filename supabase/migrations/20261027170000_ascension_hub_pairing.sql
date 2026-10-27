-- Dedicated operator hub pairing. Key material is never stored in plaintext.
CREATE TABLE IF NOT EXISTS public.ascension_hub_connections (
  id text PRIMARY KEY CHECK (id='primary'),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash text NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
ALTER TABLE public.ascension_hub_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ascension_hub_connections FROM anon,authenticated;
-- Service-role-only. The issuer requires a valid Supabase JWT matching
-- ASCENSION_HUB_OWNER_USER_ID. Do not add anon/authenticated RLS policies.
