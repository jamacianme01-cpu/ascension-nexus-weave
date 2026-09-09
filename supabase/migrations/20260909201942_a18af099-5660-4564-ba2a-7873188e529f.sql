CREATE TABLE public.ascension_relay_documents (
  path TEXT NOT NULL PRIMARY KEY,
  body TEXT NOT NULL,
  revision INTEGER,
  source_classification TEXT,
  http_status INTEGER NOT NULL DEFAULT 200,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ascension_relay_documents TO anon;
GRANT SELECT ON public.ascension_relay_documents TO authenticated;
GRANT ALL ON public.ascension_relay_documents TO service_role;

ALTER TABLE public.ascension_relay_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Relay documents are publicly readable"
ON public.ascension_relay_documents
FOR SELECT
TO anon, authenticated
USING (true);