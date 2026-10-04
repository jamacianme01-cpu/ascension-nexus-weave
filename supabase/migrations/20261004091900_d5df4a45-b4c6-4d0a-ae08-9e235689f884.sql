-- Guests may record the EXTERNAL, UNVERIFIED draft (ordinal 102) for their own
-- run as soon as it is accepted, so ENGAGE answers without the local worker.
-- Governed stages and the run record remain unwritable here.
CREATE OR REPLACE FUNCTION public.ascension_guest_draft(
  p_request_id uuid, p_guest_token uuid, p_action text, p_source_key text,
  p_expected_created_at timestamptz, p_payload jsonb, p_error text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_n integer;
BEGIN
  IF p_source_key IS NULL OR length(p_source_key) > 200 THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ascension_execution_requests r
    WHERE r.id = p_request_id AND r.submitted_by IS NULL AND r.status IN ('queued','claimed','running','verified')
      AND r.guest_key_hash = encode(digest(p_guest_token::text, 'sha256'), 'hex')
  ) THEN RETURN false; END IF;

  IF p_action = 'claim' THEN
    IF p_expected_created_at IS NULL THEN
      INSERT INTO public.ascension_run_stages (request_id, ordinal, stage, engine_label, status, request_payload)
      VALUES (p_request_id, 102, 'external_result', 'ZAI_EXTERNAL_RESULT', 'running',
              jsonb_build_object('source_key', p_source_key, 'attempts', 1))
      ON CONFLICT (request_id, ordinal) DO NOTHING;
    ELSE
      UPDATE public.ascension_run_stages
         SET status = 'running', error = NULL, response_payload = NULL, response_text = NULL,
             completed_at = NULL, created_at = now(),
             request_payload = jsonb_build_object('source_key', p_source_key,
               'attempts', COALESCE((request_payload->>'attempts')::int, 0) + 1)
       WHERE request_id = p_request_id AND ordinal = 102 AND created_at = p_expected_created_at
         AND COALESCE((request_payload->>'attempts')::int, 0) < 6
         AND (status <> 'running' OR created_at < now() - interval '3 minutes');
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n = 1;
  ELSIF p_action IN ('complete', 'fail') THEN
    IF p_action = 'complete' AND (p_payload IS NULL OR pg_column_size(p_payload) > 300000) THEN RETURN false; END IF;
    UPDATE public.ascension_run_stages
       SET status = CASE WHEN p_action = 'complete' THEN 'completed' ELSE 'failed' END,
           response_payload = CASE WHEN p_action = 'complete' THEN p_payload ELSE NULL END,
           response_text = CASE WHEN p_action = 'complete' THEN left(p_payload->>'body', 40000) ELSE NULL END,
           error = CASE WHEN p_action = 'fail' THEN left(COALESCE(p_error, 'unknown error'), 2000) ELSE NULL END,
           engine_model = 'external',
           completed_at = now(),
           duration_ms = (extract(epoch FROM now() - created_at) * 1000)::int
     WHERE request_id = p_request_id AND ordinal = 102 AND status = 'running'
       AND request_payload->>'source_key' = p_source_key;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n = 1;
  END IF;
  RETURN false;
END $$;

REVOKE ALL ON FUNCTION public.ascension_guest_draft(uuid,uuid,text,text,timestamptz,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ascension_guest_draft(uuid,uuid,text,text,timestamptz,jsonb,text) TO anon, authenticated;