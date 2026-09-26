ALTER TABLE public.ascension_execution_requests ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE public.ascension_execution_requests ADD COLUMN IF NOT EXISTS guest_key_hash text;
ALTER TABLE public.ascension_execution_requests
  ADD CONSTRAINT ascension_execution_requests_owner_present
  CHECK (submitted_by IS NOT NULL OR guest_key_hash IS NOT NULL);
CREATE INDEX IF NOT EXISTS ascension_execution_requests_guest_key_idx
  ON public.ascension_execution_requests (guest_key_hash, created_at DESC)
  WHERE guest_key_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ascension_guest_hash(p_guest_key text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF p_guest_key IS NULL OR p_guest_key !~ '^[A-Za-z0-9_-]{43,128}$' THEN
    RAISE EXCEPTION 'Invalid guest session.';
  END IF;
  RETURN encode(sha256(convert_to(p_guest_key, 'UTF8')), 'hex');
END $$;
REVOKE ALL ON FUNCTION public.ascension_guest_hash(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_guest_objective(
  p_guest_key text, p_objective text, p_evidence jsonb, p_constraints jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h text := public.ascension_guest_hash(p_guest_key);
  r public.ascension_execution_requests;
BEGIN
  IF p_objective IS NULL OR length(btrim(p_objective)) = 0 OR length(p_objective) > 4000 THEN
    RAISE EXCEPTION 'An objective statement is required (max 4000 characters).';
  END IF;
  IF p_evidence IS NOT NULL AND (jsonb_typeof(p_evidence) <> 'array' OR length(p_evidence::text) > 120000) THEN
    RAISE EXCEPTION 'Invalid evidence.';
  END IF;
  IF p_constraints IS NOT NULL AND (jsonb_typeof(p_constraints) <> 'array' OR length(p_constraints::text) > 20000) THEN
    RAISE EXCEPTION 'Invalid constraints.';
  END IF;
  IF (SELECT count(*) FROM public.ascension_execution_requests
      WHERE guest_key_hash = h AND created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Too many objectives from this session. Please wait a little and try again.';
  END IF;
  INSERT INTO public.ascension_execution_requests
    (engine, submitted_by, guest_key_hash, submitted_via, objective, evidence, constraints)
  VALUES ('governed_runtime', NULL, h, 'web_guest', btrim(p_objective), p_evidence, p_constraints)
  RETURNING * INTO r;
  RETURN to_jsonb(r) - 'guest_key_hash' - 'submitted_by';
END $$;

CREATE OR REPLACE FUNCTION public.get_guest_objective(p_guest_key text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ascension_execution_requests;
BEGIN
  SELECT * INTO r FROM public.ascension_execution_requests
   WHERE id = p_request_id AND guest_key_hash = public.ascension_guest_hash(p_guest_key);
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(r) - 'guest_key_hash' - 'submitted_by';
END $$;

CREATE OR REPLACE FUNCTION public.get_guest_delivery_stages(p_guest_key text, p_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'ordinal', s.ordinal, 'status', s.status, 'response_payload', s.response_payload,
      'error', s.error, 'engine_model', s.engine_model, 'engine_label', s.engine_label,
      'created_at', s.created_at)), '[]'::jsonb)
  FROM public.ascension_run_stages s
  JOIN public.ascension_execution_requests r ON r.id = s.request_id
  WHERE s.request_id = p_request_id AND s.ordinal IN (100, 101)
    AND r.guest_key_hash = public.ascension_guest_hash(p_guest_key);
$$;

REVOKE ALL ON FUNCTION public.submit_guest_objective(text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_guest_objective(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_guest_delivery_stages(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_guest_objective(text, text, jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_objective(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_delivery_stages(text, uuid) TO anon, authenticated, service_role;