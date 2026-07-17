-- Transactional sync report start/finish with client_cycle_id idempotency.
-- Additive: safe on already-migrated projects.

ALTER TABLE public.sync_reports
  ADD COLUMN IF NOT EXISTS client_cycle_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sync_reports_headset_client_cycle_uidx
  ON public.sync_reports (headset_id, client_cycle_id)
  WHERE client_cycle_id IS NOT NULL AND client_cycle_id <> '';

-- Idempotent start: same headset + client_cycle_id → same report_id.
CREATE OR REPLACE FUNCTION public.start_sync_report(
  _headset_id uuid,
  _cause text DEFAULT NULL,
  _client_cycle_id text DEFAULT NULL,
  _session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.sync_reports%ROWTYPE;
  now_ts timestamptz := now();
BEGIN
  IF _headset_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_headset_id');
  END IF;

  IF _client_cycle_id IS NOT NULL AND length(trim(_client_cycle_id)) > 0 THEN
    SELECT * INTO r
      FROM public.sync_reports
     WHERE headset_id = _headset_id
       AND client_cycle_id = _client_cycle_id
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'report_id', r.id,
        'idempotent', true
      );
    END IF;
  END IF;

  INSERT INTO public.sync_reports (
    headset_id, status, cause, client_cycle_id, session_id, started_at
  ) VALUES (
    _headset_id, 'started', _cause,
    NULLIF(trim(COALESCE(_client_cycle_id, '')), ''),
    NULLIF(trim(COALESCE(_session_id, '')), ''),
    now_ts
  )
  RETURNING * INTO r;

  UPDATE public.headsets
     SET last_sync_status = 'started',
         last_sync_at = now_ts
   WHERE id = _headset_id;

  RETURN jsonb_build_object(
    'ok', true,
    'report_id', r.id,
    'idempotent', false
  );
END;
$$;

-- Finish report + update headset.applied in ONE transaction with row locks.
CREATE OR REPLACE FUNCTION public.finalize_sync_report(
  _headset_id uuid,
  _report_id uuid,
  _status public.sync_status,
  _applied_manifest_version bigint DEFAULT NULL,
  _downloaded_count int DEFAULT 0,
  _failed_count int DEFAULT 0,
  _deleted_count int DEFAULT 0,
  _total_bytes bigint DEFAULT 0,
  _error_message text DEFAULT NULL,
  _details jsonb DEFAULT NULL,
  _playlist_id uuid DEFAULT NULL,
  _remote_video_count int DEFAULT NULL,
  _local_video_count int DEFAULT NULL,
  _visible_video_count int DEFAULT NULL,
  _cause text DEFAULT NULL,
  _client_cycle_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_row public.sync_reports%ROWTYPE;
  hs public.headsets%ROWTYPE;
  now_ts timestamptz := now();
  previous_applied bigint;
  server_desired bigint;
  applied_updated boolean := false;
  accepted_applied bigint;
  reason text := 'skipped';
  report_stored boolean := false;
BEGIN
  IF _headset_id IS NULL OR _report_id IS NULL OR _status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_args');
  END IF;

  IF _status NOT IN ('success', 'partial', 'failed', 'no_change') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT * INTO report_row
    FROM public.sync_reports
   WHERE id = _report_id
     AND headset_id = _headset_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'report_stored', false,
      'applied_updated', false,
      'reason', 'invalid_report_id'
    );
  END IF;

  IF _client_cycle_id IS NOT NULL
     AND report_row.client_cycle_id IS NOT NULL
     AND report_row.client_cycle_id <> _client_cycle_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'report_stored', false,
      'applied_updated', false,
      'reason', 'client_cycle_mismatch'
    );
  END IF;

  IF report_row.finished_at IS NOT NULL AND report_row.status IS DISTINCT FROM 'started' THEN
    SELECT * INTO hs FROM public.headsets WHERE id = _headset_id;
    RETURN jsonb_build_object(
      'ok', true,
      'report_stored', false,
      'applied_updated', false,
      'accepted_applied_manifest_version', COALESCE(hs.applied_manifest_version, 0),
      'server_desired_manifest_version', COALESCE(hs.desired_manifest_version, 0),
      'server_previous_applied_manifest_version', COALESCE(hs.applied_manifest_version, 0),
      'reason', 'report_already_finished'
    );
  END IF;

  SELECT * INTO hs
    FROM public.headsets
   WHERE id = _headset_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'report_stored', false,
      'applied_updated', false,
      'reason', 'headset_not_found'
    );
  END IF;

  previous_applied := COALESCE(hs.applied_manifest_version, 0);
  server_desired := COALESCE(hs.desired_manifest_version, 0);
  accepted_applied := previous_applied;

  UPDATE public.sync_reports
     SET status = _status,
         finished_at = now_ts,
         downloaded_count = COALESCE(_downloaded_count, 0),
         failed_count = COALESCE(_failed_count, 0),
         deleted_count = COALESCE(_deleted_count, 0),
         total_bytes = COALESCE(_total_bytes, 0),
         error_message = _error_message,
         details = _details,
         applied_manifest_version = _applied_manifest_version,
         playlist_id = _playlist_id,
         remote_video_count = _remote_video_count,
         local_video_count = _local_video_count,
         visible_video_count = _visible_video_count,
         cause = COALESCE(_cause, cause)
   WHERE id = _report_id
     AND headset_id = _headset_id;

  report_stored := true;

  IF _status IN ('success', 'no_change')
     AND _applied_manifest_version IS NOT NULL
     AND _applied_manifest_version > 0 THEN
    IF _applied_manifest_version < previous_applied THEN
      reason := 'rollback';
    ELSIF _applied_manifest_version > server_desired THEN
      reason := 'above_desired';
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.manifest_versions
       WHERE headset_id = _headset_id
         AND version = _applied_manifest_version
    ) THEN
      reason := 'unknown_version';
    ELSE
      UPDATE public.headsets
         SET applied_manifest_version = _applied_manifest_version,
             last_sync_status = _status,
             last_sync_at = now_ts,
             last_seen_at = now_ts,
             last_contact_source = 'sync_report'
       WHERE id = _headset_id;
      applied_updated := true;
      accepted_applied := _applied_manifest_version;
      reason := 'ok';
    END IF;
  ELSIF _status IN ('success', 'no_change') THEN
    reason := 'missing_applied_manifest_version';
  ELSE
    reason := 'invalid_status';
  END IF;

  IF NOT applied_updated THEN
    UPDATE public.headsets
       SET last_sync_status = _status,
           last_sync_at = now_ts,
           last_seen_at = now_ts,
           last_contact_source = 'sync_report'
     WHERE id = _headset_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'report_stored', report_stored,
    'applied_updated', applied_updated,
    'accepted_applied_manifest_version', accepted_applied,
    'server_desired_manifest_version', server_desired,
    'server_previous_applied_manifest_version', previous_applied,
    'reason', reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_sync_report(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_sync_report(
  uuid, uuid, public.sync_status, bigint, int, int, int, bigint, text, jsonb, uuid, int, int, int, text, text
) TO service_role;
