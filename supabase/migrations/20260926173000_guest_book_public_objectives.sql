-- Allow the ASCENSION Book to accept public guest objectives without UI sign-in
-- or a service-role secret in the local web process. Guest access is scoped by
-- an unguessable per-request token returned only to the submitting browser.

ALTER TABLE public.ascension_execution_requests
  ALTER COLUMN submitted_by DROP NOT NULL;

ALTER TABLE public.ascension_execution_requests
  ADD COLUMN IF NOT EXISTS guest_token uuid;

CREATE INDEX IF NOT EXISTS ascension_execution_requests_guest_idx
  ON public.ascension_execution_requests (id, guest_token)
  WHERE submitted_by IS NULL;

CREATE OR REPLACE FUNCTION public.ascension_guest_submit(
  p_objective text,
  p_evidence jsonb DEFAULT NULL,
  p_constraints jsonb DEFAULT NULL,
  p_parent_request_id uuid DEFAULT NULL,
  p_parent_guest_token uuid DEFAULT NULL,
  p_follow_up text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $
DECLARE
  v_objective text := btrim(coalesce(p_objective, ''));
  v_token uuid := gen_random_uuid();
  v_hash text := encode(digest(v_token::text, 'sha256'), 'hex');
  v_evidence jsonb := p_evidence;
  v_parent public.ascension_execution_requests%rowtype;
  v_parent_delivery jsonb;
  v_row public.ascension_execution_requests%rowtype;
BEGIN
  IF v_objective = '' THEN
    RAISE EXCEPTION 'An objective statement is required.';
  END IF;
  IF length(v_objective) > 4000 THEN
    v_objective := left(v_objective, 4000);
  END IF;

  IF p_parent_request_id IS NOT NULL THEN
    IF p_parent_guest_token IS NULL OR p_follow_up NOT IN ('continue', 'refine') THEN
      RAISE EXCEPTION 'Invalid guest follow-up reference.';
    END IF;

    SELECT * INTO v_parent
    FROM public.ascension_execution_requests
    WHERE id = p_parent_request_id
      AND guest_key_hash = encode(digest(p_parent_guest_token::text, 'sha256'), 'hex')
      AND submitted_by IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The earlier objective is unavailable.';
    END IF;

    SELECT s.response_payload INTO v_parent_delivery
    FROM public.ascension_run_stages s
    WHERE s.request_id = v_parent.id
      AND s.ordinal = 100
      AND s.status = 'completed'
    LIMIT 1;

    v_evidence := coalesce(v_evidence, '[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object(
        'parent_request_id', v_parent.id,
        'requested_action', p_follow_up,
        'prior_objective', v_parent.objective,
        'prior_result', v_parent_delivery,
        'verification', 'Prior result supplied as continuation context.'
      ));
  END IF;

  INSERT INTO public.ascension_execution_requests (
    engine,
    submitted_by,
    submitted_via,
    guest_key_hash,
    guest_token,
    objective,
    evidence,
    constraints
  ) VALUES (
    'governed_runtime',
    NULL,
    'web_guest',
    v_hash,
    v_token,
    v_objective,
    v_evidence,
    p_constraints
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'request', (to_jsonb(v_row) - 'guest_token') - 'guest_key_hash',
    'guest_token', v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ascension_guest_status(
  p_request_id uuid,
  p_guest_token uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $
  SELECT (to_jsonb(r) - 'guest_token') - 'guest_key_hash'
  FROM public.ascension_execution_requests r
  WHERE r.id = p_request_id
    AND r.guest_key_hash = encode(digest(p_guest_token::text, 'sha256'), 'hex')
    AND r.submitted_by IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ascension_guest_bundle(
  p_request_id uuid,
  p_guest_token uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $
  SELECT jsonb_build_object(
    'run', (to_jsonb(r) - 'guest_token') - 'guest_key_hash',
    'delivery_stage', (
      SELECT to_jsonb(s)
      FROM public.ascension_run_stages s
      WHERE s.request_id = r.id AND s.ordinal = 100
      LIMIT 1
    ),
    'artifact_stage', (
      SELECT to_jsonb(s)
      FROM public.ascension_run_stages s
      WHERE s.request_id = r.id AND s.ordinal = 101
      LIMIT 1
    )
  )
  FROM public.ascension_execution_requests r
  WHERE r.id = p_request_id
    AND r.guest_key_hash = encode(digest(p_guest_token::text, 'sha256'), 'hex')
    AND r.submitted_by IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.ascension_guest_submit(text,jsonb,jsonb,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ascension_guest_status(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ascension_guest_bundle(uuid,uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ascension_guest_submit(text,jsonb,jsonb,uuid,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascension_guest_status(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascension_guest_bundle(uuid,uuid) TO anon, authenticated;
