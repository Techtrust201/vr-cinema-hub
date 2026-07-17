-- Atomic one-shot delivery of the device token after admin claim.
-- Prevents two concurrent pair-polls from both receiving the same token.

CREATE OR REPLACE FUNCTION public.claim_pairing_device_token(
  _code text,
  _pairing_secret text
)
RETURNS TABLE (
  status text,
  headset_id uuid,
  device_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_secret text;
  v_expires timestamptz;
  v_token text;
  v_headset uuid;
  v_failed int;
BEGIN
  SELECT pc.id, pc.pairing_secret, pc.expires_at, pc.device_token, pc.claimed_by_headset_id, pc.failed_attempts
    INTO v_id, v_secret, v_expires, v_token, v_headset, v_failed
  FROM public.pairing_codes pc
  WHERE pc.code = _code
  FOR UPDATE;

  IF NOT FOUND THEN
    status := 'not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_secret IS DISTINCT FROM _pairing_secret THEN
    UPDATE public.pairing_codes
      SET failed_attempts = COALESCE(v_failed, 0) + 1
      WHERE id = v_id;
    status := 'unauthorized';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_expires < now() THEN
    status := 'expired';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_headset IS NULL OR v_token IS NULL THEN
    status := 'pending';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Atomic consume: only the row that still holds the token wins.
  UPDATE public.pairing_codes
     SET device_token = NULL
   WHERE id = v_id
     AND device_token IS NOT NULL;

  IF NOT FOUND THEN
    status := 'pending';
    RETURN NEXT;
    RETURN;
  END IF;

  status := 'claimed';
  headset_id := v_headset;
  device_token := v_token;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pairing_device_token(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pairing_device_token(text, text) TO service_role;
