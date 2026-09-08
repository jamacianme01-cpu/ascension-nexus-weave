CREATE TABLE public.ascension_publications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  revision INTEGER NOT NULL,
  surface TEXT NOT NULL,
  source_classification TEXT NOT NULL,
  snapshot_hash TEXT,
  content_hash TEXT,
  payload JSONB NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (revision, surface)
);

CREATE INDEX ascension_publications_surface_revision_idx
  ON public.ascension_publications (surface, revision DESC);

GRANT SELECT ON public.ascension_publications TO authenticated;
GRANT ALL ON public.ascension_publications TO service_role;

ALTER TABLE public.ascension_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read governed publications"
  ON public.ascension_publications FOR SELECT TO authenticated USING (true);

CREATE TABLE public.ascension_user_observations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  surface TEXT,
  entity_id TEXT,
  revision INTEGER,
  label TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX ascension_user_observations_user_idx
  ON public.ascension_user_observations (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ascension_user_observations TO authenticated;
GRANT ALL ON public.ascension_user_observations TO service_role;

ALTER TABLE public.ascension_user_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own observations"
  ON public.ascension_user_observations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ascension_user_observations_touch
  BEFORE UPDATE ON public.ascension_user_observations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();