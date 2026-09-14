DROP POLICY IF EXISTS "Relay documents are publicly readable" ON public.ascension_relay_documents;
DROP POLICY IF EXISTS "Anyone can read relay documents" ON public.ascension_relay_documents;
DROP POLICY IF EXISTS "Public read relay documents" ON public.ascension_relay_documents;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ascension_relay_documents' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.ascension_relay_documents', pol.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.ascension_relay_documents FROM anon;
REVOKE ALL ON public.ascension_relay_documents FROM authenticated;
GRANT ALL ON public.ascension_relay_documents TO service_role;

ALTER TABLE public.ascension_relay_documents ENABLE ROW LEVEL SECURITY;