-- Additive: open remaining admin-only content gates to owner/admin/operator.
-- Does not alter previous migrations. Relies on public.can_manage_content().

-- diagnose_headset_sync: add rollback_verified
CREATE OR REPLACE FUNCTION public.diagnose_headset_sync(_headset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _result jsonb;
  _headset jsonb;
  _groups jsonb;
  _assignments jsonb;
  _effective_playlists jsonb;
  _manifest_versions jsonb;
  _triggers jsonb;
  _bump_dry_run jsonb;
  _pl_id uuid;
  _vid uuid;
  _before bigint;
  _after bigint;
  _after_rollback bigint;
  _row_exists boolean;
BEGIN
  IF NOT public.can_manage_content(auth.uid()) THEN
    RAISE EXCEPTION 'content_manager_required' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(h) - 'device_token_hash' INTO _headset
    FROM public.headsets h WHERE id = _headset_id;
  IF _headset IS NULL THEN
    RETURN jsonb_build_object('error', 'headset_not_found', 'headset_id', _headset_id);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'group_id', g.id, 'group_name', g.name, 'added_at', hgm.added_at
  ) ORDER BY g.name), '[]'::jsonb) INTO _groups
  FROM public.headset_group_members hgm
  JOIN public.headset_groups g ON g.id = hgm.group_id
  WHERE hgm.headset_id = _headset_id;

  WITH eff AS (
    SELECT a.id AS assignment_id, a.target_type, a.target_id, a.playlist_id, p.name AS playlist_name
    FROM public.assignments a
    JOIN public.playlists p ON p.id = a.playlist_id
    WHERE a.target_type = 'all'
       OR (a.target_type = 'headset' AND a.target_id = _headset_id)
       OR (a.target_type = 'group' AND a.target_id IN (
             SELECT group_id FROM public.headset_group_members WHERE headset_id = _headset_id))
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(eff) ORDER BY eff.playlist_name), '[]'::jsonb)
  INTO _assignments FROM eff;

  WITH pls AS (
    SELECT DISTINCT a.playlist_id FROM public.assignments a
    WHERE a.target_type = 'all'
       OR (a.target_type = 'headset' AND a.target_id = _headset_id)
       OR (a.target_type = 'group' AND a.target_id IN (
             SELECT group_id FROM public.headset_group_members WHERE headset_id = _headset_id))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'playlist_id', p.id, 'playlist_name', p.name,
    'videos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('video_id', v.id, 'name', v.name, 'position', pv.position) ORDER BY pv.position)
      FROM public.playlist_videos pv JOIN public.videos v ON v.id = pv.video_id
      WHERE pv.playlist_id = p.id
    ), '[]'::jsonb)
  ) ORDER BY p.name), '[]'::jsonb)
  INTO _effective_playlists
  FROM pls JOIN public.playlists p ON p.id = pls.playlist_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'version', mv.version, 'cause', mv.cause,
    'created_at', mv.created_at, 'playlist_id', mv.playlist_id
  ) ORDER BY mv.version DESC), '[]'::jsonb)
  INTO _manifest_versions
  FROM (SELECT * FROM public.manifest_versions WHERE headset_id = _headset_id
        ORDER BY version DESC LIMIT 10) mv;

  SELECT jsonb_build_object(
    'playlist_videos_invalidate', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='playlist_videos_invalidate' AND NOT tgisinternal),
    'assignments_invalidate', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='assignments_invalidate' AND NOT tgisinternal),
    'group_members_invalidate', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='group_members_invalidate' AND NOT tgisinternal),
    'videos_invalidate', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='videos_invalidate' AND NOT tgisinternal)
  ) INTO _triggers;

  SELECT (_effective_playlists->0->>'playlist_id')::uuid INTO _pl_id;
  IF _pl_id IS NULL THEN
    _bump_dry_run := jsonb_build_object(
      'method', 'skipped', 'would_bump', false,
      'reason', 'no_effective_playlist', 'rollback_verified', true);
  ELSE
    SELECT desired_manifest_version INTO _before FROM public.headsets WHERE id = _headset_id;
    BEGIN
      SELECT v.id INTO _vid FROM public.videos v
      WHERE NOT EXISTS (SELECT 1 FROM public.playlist_videos pv
                        WHERE pv.playlist_id = _pl_id AND pv.video_id = v.id)
      LIMIT 1;

      IF _vid IS NOT NULL THEN
        INSERT INTO public.playlist_videos (playlist_id, video_id, position)
          VALUES (_pl_id, _vid, 99999);
        SELECT desired_manifest_version INTO _after FROM public.headsets WHERE id = _headset_id;
        _bump_dry_run := jsonb_build_object(
          'method', 'insert', 'would_bump', _after > _before,
          'before_desired', _before, 'after_desired_inside_transaction', _after,
          'rolled_back', true, 'reason', 'ok');
      ELSE
        SELECT EXISTS(SELECT 1 FROM public.playlist_videos WHERE playlist_id = _pl_id) INTO _row_exists;
        IF NOT _row_exists THEN
          _bump_dry_run := jsonb_build_object(
            'method', 'skipped', 'would_bump', false,
            'reason', 'playlist_empty_and_no_other_video', 'rollback_verified', true);
        ELSE
          UPDATE public.playlist_videos
             SET position = position
           WHERE playlist_id = _pl_id
             AND video_id = (SELECT video_id FROM public.playlist_videos WHERE playlist_id = _pl_id LIMIT 1);
          SELECT desired_manifest_version INTO _after FROM public.headsets WHERE id = _headset_id;
          _bump_dry_run := jsonb_build_object(
            'method', 'update', 'would_bump', _after > _before,
            'before_desired', _before, 'after_desired_inside_transaction', _after,
            'rolled_back', true, 'reason', 'ok');
        END IF;
      END IF;

      RAISE EXCEPTION 'ROLLBACK_DIAGNOSE_OK';
    EXCEPTION
      WHEN OTHERS THEN
        IF _bump_dry_run IS NULL THEN
          _bump_dry_run := jsonb_build_object(
            'method', 'error', 'would_bump', false, 'reason', SQLERRM,
            'rollback_verified', false);
        END IF;
    END;

    -- Verify rollback restored original value
    SELECT desired_manifest_version INTO _after_rollback FROM public.headsets WHERE id = _headset_id;
    _bump_dry_run := _bump_dry_run
      || jsonb_build_object(
           'desired_after_rollback', _after_rollback,
           'rollback_verified', (_after_rollback = _before)
         );
  END IF;

  _result := jsonb_build_object(
    'headset', _headset,
    'groups', _groups,
    'assignments_effective', _assignments,
    'effective_playlists', _effective_playlists,
    'manifest_versions_recent', _manifest_versions,
    'triggers_present', _triggers,
    'bump_dry_run', _bump_dry_run
  );
  RETURN _result;
END;
$function$;

-- diagnose_playlist_impact: use headsets_for_playlist as source of truth
CREATE OR REPLACE FUNCTION public.diagnose_playlist_impact(_playlist_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _result jsonb;
  _playlist jsonb;
  _direct jsonb;
  _group jsonb;
  _all jsonb;
  _impacted jsonb;
  _trigger_headsets jsonb;
  _trigger_count int;
  _impacted_count int;
BEGIN
  IF NOT public.can_manage_content(auth.uid()) THEN
    RAISE EXCEPTION 'content_manager_required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id, 'name', p.name,
    'video_count', (SELECT count(*) FROM public.playlist_videos WHERE playlist_id = p.id)
  ) INTO _playlist
  FROM public.playlists p WHERE id = _playlist_id;

  IF _playlist IS NULL THEN
    RETURN jsonb_build_object('error', 'playlist_not_found', 'playlist_id', _playlist_id);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'assignment_id', a.id, 'headset_id', h.id, 'headset_name', h.name
  ) ORDER BY h.name), '[]'::jsonb) INTO _direct
  FROM public.assignments a
  JOIN public.headsets h ON h.id = a.target_id
  WHERE a.playlist_id = _playlist_id AND a.target_type = 'headset';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'assignment_id', a.id, 'group_id', g.id, 'group_name', g.name,
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('headset_id', h.id, 'headset_name', h.name) ORDER BY h.name)
      FROM public.headset_group_members hgm
      JOIN public.headsets h ON h.id = hgm.headset_id
      WHERE hgm.group_id = g.id
    ), '[]'::jsonb)
  ) ORDER BY g.name), '[]'::jsonb) INTO _group
  FROM public.assignments a
  JOIN public.headset_groups g ON g.id = a.target_id
  WHERE a.playlist_id = _playlist_id AND a.target_type = 'group';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('assignment_id', a.id)), '[]'::jsonb)
  INTO _all FROM public.assignments a
  WHERE a.playlist_id = _playlist_id AND a.target_type = 'all';

  -- Trigger target headsets = source of truth
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'headset_id', h.id, 'headset_name', h.name
  ) ORDER BY h.name), '[]'::jsonb), count(*)
  INTO _trigger_headsets, _trigger_count
  FROM public.headsets_for_playlist(_playlist_id) hp
  JOIN public.headsets h ON h.id = hp.headset_id;

  -- Enrichment per path (informational only)
  WITH paths AS (
    SELECT h.id AS headset_id, 'direct'::text AS path, NULL::uuid AS group_id, NULL::text AS group_name
    FROM public.assignments a JOIN public.headsets h ON h.id = a.target_id
    WHERE a.playlist_id = _playlist_id AND a.target_type = 'headset' AND h.status = 'active'
    UNION ALL
    SELECT hgm.headset_id, 'group:' || g.name, g.id, g.name
    FROM public.assignments a
    JOIN public.headset_groups g ON g.id = a.target_id
    JOIN public.headset_group_members hgm ON hgm.group_id = g.id
    JOIN public.headsets h ON h.id = hgm.headset_id
    WHERE a.playlist_id = _playlist_id AND a.target_type = 'group' AND h.status = 'active'
    UNION ALL
    SELECT h.id, 'all', NULL, NULL FROM public.headsets h
    WHERE h.status = 'active'
      AND EXISTS (SELECT 1 FROM public.assignments a
                  WHERE a.playlist_id = _playlist_id AND a.target_type = 'all')
  ),
  agg AS (
    SELECT p.headset_id,
           array_agg(DISTINCT p.path) AS impact_paths,
           array_remove(array_agg(DISTINCT p.group_id), NULL) AS group_ids,
           array_remove(array_agg(DISTINCT p.group_name), NULL) AS group_names
    FROM paths p
    GROUP BY p.headset_id
  )
  -- Final list = headsets_for_playlist enriched with impact_paths (LEFT JOIN keeps SoT)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'headset_id', h.id, 'headset_name', h.name, 'status', h.status,
    'desired', h.desired_manifest_version, 'applied', h.applied_manifest_version,
    'impact_paths', COALESCE(to_jsonb(agg.impact_paths), '[]'::jsonb),
    'group_ids', COALESCE(to_jsonb(agg.group_ids), '[]'::jsonb),
    'group_names', COALESCE(to_jsonb(agg.group_names), '[]'::jsonb)
  ) ORDER BY h.name), '[]'::jsonb)
  INTO _impacted
  FROM public.headsets_for_playlist(_playlist_id) hp
  JOIN public.headsets h ON h.id = hp.headset_id
  LEFT JOIN agg ON agg.headset_id = hp.headset_id;

  _impacted_count := jsonb_array_length(_impacted);

  _result := jsonb_build_object(
    'playlist', _playlist,
    'assignments', jsonb_build_object('direct', _direct, 'group', _group, 'all', _all),
    'trigger_target_headsets', _trigger_headsets,
    'trigger_target_count', _trigger_count,
    'impacted_headsets', _impacted,
    'diagnostic_headsets', _impacted,
    'discrepancy', _trigger_count <> _impacted_count
  );
  RETURN _result;
END;
$function$;

-- manifest_versions: content managers may read (was admin-only)
DROP POLICY IF EXISTS manifest_versions_admin_read ON public.manifest_versions;
DROP POLICY IF EXISTS manifest_versions_content_managers_read ON public.manifest_versions;
CREATE POLICY manifest_versions_content_managers_read ON public.manifest_versions
  FOR SELECT TO authenticated
  USING (public.can_manage_content(auth.uid()));
