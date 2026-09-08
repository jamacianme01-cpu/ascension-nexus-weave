CREATE TABLE public.ascension_execution_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submitted_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_via text NOT NULL DEFAULT 'mcp',
  objective text NOT NULL,
  evidence jsonb,
  constraints jsonb,
  status text NOT NULL DEFAULT 'queued',
  stage text,
  claimed_at timestamp with time zone,
  claimed_by text,
  completed_at timestamp with time zone,
  runtime_revision integer,
  transition_id text,
  accepted_delta jsonb,
  guardian_verdict text,
  outcome_status text,
  result jsonb,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ascension_execution_requests_status_check
    CHECK (status IN ('queued','claimed','running','verified','rejected','failed'))
);

CREATE INDEX ascension_execution_requests_queue_idx
  ON public.ascension_execution_requests (status, created_at);
CREATE INDEX ascension_execution_requests_submitter_idx
  ON public.ascension_execution_requests (submitted_by, created_at DESC);

GRANT SELECT, INSERT ON public.ascension_execution_requests TO authenticated;
GRANT ALL ON public.ascension_execution_requests TO service_role;

ALTER TABLE public.ascension_execution_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators read their own submissions"
  ON public.ascension_execution_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = submitted_by);

CREATE POLICY "Operators submit objectives"
  ON public.ascension_execution_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = submitted_by);

CREATE TRIGGER ascension_execution_requests_touch
  BEFORE UPDATE ON public.ascension_execution_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();