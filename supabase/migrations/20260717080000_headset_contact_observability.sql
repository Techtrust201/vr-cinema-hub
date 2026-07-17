-- Non-destructive observability columns for headset contact provenance.
-- last_seen_at remains the aggregate "any contact" timestamp.
-- last_heartbeat_at / last_contact_source refine how the dashboard interprets presence.

ALTER TABLE public.headsets
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_contact_source text NULL,
  ADD COLUMN IF NOT EXISTS last_error_code text NULL,
  ADD COLUMN IF NOT EXISTS last_error_message text NULL;

COMMENT ON COLUMN public.headsets.last_heartbeat_at IS
  'Last successful headset-heartbeat call. Distinct from last_seen_at (any contact).';
COMMENT ON COLUMN public.headsets.last_contact_source IS
  'Provenance of last_seen_at: manifest | heartbeat | sync_report | pairing | foreground';
COMMENT ON COLUMN public.headsets.last_error_code IS
  'Last device-reported or server-classified error code (optional).';
COMMENT ON COLUMN public.headsets.last_error_message IS
  'Last device-reported or server-classified error message (optional).';
