ALTER TABLE public.ascension_execution_requests
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'governed_runtime',
  ADD COLUMN IF NOT EXISTS engine_status text,
  ADD COLUMN IF NOT EXISTS epistemic_label text;

ALTER TABLE public.ascension_execution_requests
  DROP CONSTRAINT IF EXISTS ascension_execution_requests_engine_check;
ALTER TABLE public.ascension_execution_requests
  ADD CONSTRAINT ascension_execution_requests_engine_check
  CHECK (engine IN ('governed_runtime','zai'));

ALTER TABLE public.ascension_execution_requests
  DROP CONSTRAINT IF EXISTS ascension_execution_requests_epistemic_label_check;
ALTER TABLE public.ascension_execution_requests
  ADD CONSTRAINT ascension_execution_requests_epistemic_label_check
  CHECK (epistemic_label IS NULL OR epistemic_label IN (
    'ZAI_EXTERNAL_RESULT',
    'ZAI_VERIFICATION_PENDING',
    'ZAI_VERIFIED_EXTERNAL_RESULT',
    'ZAI_REJECTED_EXTERNAL_RESULT',
    'ASCENSION_VERIFIED_PERSISTED'
  ));

CREATE TABLE IF NOT EXISTS public.ascension_run_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.ascension_execution_requests(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  stage text NOT NULL,
  engine_label text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  engine_model text,
  request_payload jsonb,
  response_payload jsonb,
  response_text text,
  duration_ms integer,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT ascension_run_stages_status_check
    CHECK (status IN ('running','completed','blocked','failed')),
  CONSTRAINT ascension_run_stages_unique_ordinal UNIQUE (request_id, ordinal)
);

CREATE INDEX IF NOT EXISTS ascension_run_stages_request_idx
  ON public.ascension_run_stages (request_id, ordinal);

GRANT SELECT ON public.ascension_run_stages TO authenticated;
GRANT ALL ON public.ascension_run_stages TO service_role;

ALTER TABLE public.ascension_run_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operators read stages of their own submissions" ON public.ascension_run_stages;
CREATE POLICY "Operators read stages of their own submissions"
  ON public.ascension_run_stages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ascension_execution_requests r
    WHERE r.id = ascension_run_stages.request_id
      AND r.submitted_by = auth.uid()
  ));