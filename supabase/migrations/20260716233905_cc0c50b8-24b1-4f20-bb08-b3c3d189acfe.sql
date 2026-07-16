
-- 1. Lock down device_token / pairing_secret column access.
-- Edge functions use service_role which bypasses column privileges; admins no longer need to see these.
REVOKE SELECT (device_token, pairing_secret) ON public.pairing_codes FROM authenticated;
REVOKE SELECT (device_token, pairing_secret) ON public.pairing_codes FROM anon;

-- 2. Revoke EXECUTE on internal SECURITY DEFINER helpers from authenticated.
-- These are only meant to run from triggers, other SECURITY DEFINER functions, or service_role.
REVOKE EXECUTE ON FUNCTION public.bump_headset_versions(uuid[], text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.headsets_for_playlist(uuid) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.trg_playlist_videos_invalidate() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.trg_group_members_invalidate() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.trg_videos_invalidate() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.trg_assignments_invalidate() FROM PUBLIC, authenticated, anon;

-- 3. Realtime channel access lockdown.
-- The app does not use Realtime subscriptions; deny-all on realtime.messages to prevent
-- any authenticated user from listening to broadcast/presence/postgres_changes topics.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
      AND policyname = 'Deny all realtime access'
  ) THEN
    CREATE POLICY "Deny all realtime access"
      ON realtime.messages
      FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
