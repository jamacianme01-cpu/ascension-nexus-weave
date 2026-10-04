-- Keep the guest delivery bundle in sync with guest.functions.ts.
-- The immediate hosted answer is stored at ordinal 102 while governed execution continues.
CREATE OR REPLACE FUNCTION public.ascension_guest_bundle(p_request_id uuid, p_guest_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT jsonb_build_object(
    'run', (to_jsonb(r) - 'guest_token') - 'guest_key_hash',
    'delivery_stage', (SELECT to_jsonb(s) FROM public.ascension_run_stages s WHERE s.request_id = r.id AND s.ordinal = 100 LIMIT 1),
    'artifact_stage', (SELECT to_jsonb(s) FROM public.ascension_run_stages s WHERE s.request_id = r.id AND s.ordinal = 101 LIMIT 1),
    'draft_stage', (SELECT to_jsonb(s) FROM public.ascension_run_stages s WHERE s.request_id = r.id AND s.ordinal = 102 LIMIT 1)
  )
  FROM public.ascension_execution_requests r
  WHERE r.id = p_request_id
    AND r.guest_key_hash = encode(digest(p_guest_token::text, 'sha256'), 'hex')
    AND r.submitted_by IS NULL
  LIMIT 1;
$$;
