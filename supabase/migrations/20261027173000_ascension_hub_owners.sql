-- Only operator-approved ASCENSION owners may pair the governed runtime.
-- No direct anon/authenticated access; grants added through trusted admin only.
CREATE TABLE IF NOT EXISTS public.ascension_hub_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ascension_hub_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ascension_hub_owners FROM anon, authenticated;
