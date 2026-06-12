
-- =========================================================================
-- diagnose_headset_sync(_headset_id)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.diagnose_headset_sync(_headset_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  _row_exists boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  -- Headset
  SELECT to_jsonb(h) - 'device_token_hash' INTO _headset
    FROM public.headsets h WHERE id = _headset_id;
  IF _headset IS NULL THEN
    RETURN jsonb_build_object('error', 'headset_not_found', 'headset_id', _headset_id);
  END IF;

  -- Groups
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'group_id', g.id, 'group_name', g.name, 'added_at', hgm.added_at
  ) ORDER BY g.name), '[]'::jsonb) INTO _groups
  FROM public.headset_group_members hgm
  JOIN public.headset_groups g ON g.id = hgm.group_id
  WHERE hgm.headset_id = _headset_id;

  -- Assignments effectifs (direct + group + all)
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

  -- Effective playlists + videos
  WITH pls AS (
    SELECT DISTINCT a.playlist_id FROM public.assignments a
    WHERE a.target_type = 'all'
       OR (a.target_type = 'headset' AND a.target_id = _headset_id)
       OR (a.target_type = 'group' AND a.target_id IN (
             SELECT group_id FROM public.headset_group_members WHERE headset_id = _headset_id))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'playlist_id', p.id,
    'playlist_name', p.name,
    'videos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'video_id', v.id, 'name', v.name, 'position', pv.position
      ) ORDER BY pv.position)
      FROM public.playlist_videos pv JOIN public.videos v ON v.id = pv.video_id
      WHERE pv.playlist_id = p.id
    ), '[]'::jsonb)
  ) ORDER BY p.name), '[]'::jsonb)
  INTO _effective_playlists
  FROM pls JOIN public.playlists p ON p.id = pls.playlist_id;

  -- Manifest versions (10 dernières)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'version', mv.version, 'cause', mv.cause,
    'created_at', mv.created_at, 'playlist_id', mv.playlist_id
  ) ORDER BY mv.version DESC), '[]'::jsonb)
  INTO _manifest_versions
  FROM (SELECT * FROM public.manifest_versions WHERE headset_id = _headset_id
        ORDER BY version DESC LIMIT 10) mv;

  -- Triggers présents
  SELECT jsonb_build_object(
    'playlist_videos_invalidate', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='playlist_videos_invalidate' AND NOT tgisinternal),
    'assignments_invalidate', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='assignments_invalidate' AND NOT tgisinternal),
    'group_members_invalidate', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='group_members_invalidate' AND NOT tgisinternal),
    'videos_invalidate', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='videos_invalidate' AND NOT tgisinternal)
  ) INTO _triggers;

  -- bump_dry_run dans sous-bloc, rollback garanti par RAISE EXCEPTION
  SELECT (_effective_playlists->0->>'playlist_id')::uuid INTO _pl_id;
  IF _pl_id IS NULL THEN
    _bump_dry_run := jsonb_build_object(
      'method', 'skipped', 'would_bump', false,
      'reason', 'no_effective_playlist');
  ELSE
    SELECT desired_manifest_version INTO _before FROM public.headsets WHERE id = _headset_id;
    BEGIN
      -- Trouve une vidéo absente de la playlist
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
        SELECT EXISTS(SELECT 1 FROM public.playlist_videos WHERE playlist_id = _pl_id)
          INTO _row_exists;
        IF NOT _row_exists THEN
          _bump_dry_run := jsonb_build_object(
            'method', 'skipped', 'would_bump', false,
            'reason', 'playlist_empty_and_no_other_video');
        ELSE
          -- Touch a row to trigger UPDATE
          UPDATE public.playlist_videos
             SET position = position
           WHERE playlist_id = _pl_id
             AND video_id = (SELECT video_id FROM public.playlist_videos
                             WHERE playlist_id = _pl_id LIMIT 1);
          SELECT desired_manifest_version INTO _after FROM public.headsets WHERE id = _headset_id;
          _bump_dry_run := jsonb_build_object(
            'method', 'update', 'would_bump', _after > _before,
            'before_desired', _before, 'after_desired_inside_transaction', _after,
            'rolled_back', true, 'reason', 'ok');
        END IF;
      END IF;

      -- Force rollback of the sub-block
      RAISE EXCEPTION 'ROLLBACK_DIAGNOSE_OK';
    EXCEPTION
      WHEN OTHERS THEN
        -- _bump_dry_run already set above; sub-block changes are rolled back.
        IF _bump_dry_run IS NULL THEN
          _bump_dry_run := jsonb_build_object(
            'method', 'error', 'would_bump', false,
            'reason', SQLERRM);
        END IF;
    END;
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
$$;

REVOKE ALL ON FUNCTION public.diagnose_headset_sync(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diagnose_headset_sync(uuid) TO authenticated;

-- =========================================================================
-- diagnose_playlist_impact(_playlist_id)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.diagnose_playlist_impact(_playlist_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _result jsonb;
  _playlist jsonb;
  _direct jsonb;
  _group jsonb;
  _all jsonb;
  _impacted jsonb;
  _trigger_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id, 'name', p.name,
    'video_count', (SELECT count(*) FROM public.playlist_videos WHERE playlist_id = p.id)
  ) INTO _playlist
  FROM public.playlists p WHERE id = _playlist_id;

  IF _playlist IS NULL THEN
    RETURN jsonb_build_object('error', 'playlist_not_found', 'playlist_id', _playlist_id);
  END IF;

  -- Direct
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'assignment_id', a.id, 'headset_id', h.id, 'headset_name', h.name
  ) ORDER BY h.name), '[]'::jsonb) INTO _direct
  FROM public.assignments a
  JOIN public.headsets h ON h.id = a.target_id
  WHERE a.playlist_id = _playlist_id AND a.target_type = 'headset';

  -- Group
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

  -- All
  SELECT COALESCE(jsonb_agg(jsonb_build_object('assignment_id', a.id)), '[]'::jsonb)
  INTO _all FROM public.assignments a
  WHERE a.playlist_id = _playlist_id AND a.target_type = 'all';

  -- Impacted headsets (dédupliqués + impact_paths)
  WITH src AS (
    -- direct
    SELECT h.id AS headset_id, 'direct'::text AS path, NULL::uuid AS group_id, NULL::text AS group_name
    FROM public.assignments a
    JOIN public.headsets h ON h.id = a.target_id
    WHERE a.playlist_id = _playlist_id AND a.target_type = 'headset' AND h.status = 'active'
    UNION ALL
    -- group
    SELECT hgm.headset_id, 'group:' || g.name, g.id, g.name
    FROM public.assignments a
    JOIN public.headset_groups g ON g.id = a.target_id
    JOIN public.headset_group_members hgm ON hgm.group_id = g.id
    JOIN public.headsets h ON h.id = hgm.headset_id
    WHERE a.playlist_id = _playlist_id AND a.target_type = 'group' AND h.status = 'active'
    UNION ALL
    -- all
    SELECT h.id, 'all', NULL, NULL FROM public.headsets h
    WHERE h.status = 'active'
      AND EXISTS (SELECT 1 FROM public.assignments a
                  WHERE a.playlist_id = _playlist_id AND a.target_type = 'all')
  ),
  agg AS (
    SELECT s.headset_id,
           array_agg(DISTINCT s.path) AS impact_paths,
           array_remove(array_agg(DISTINCT s.group_id), NULL) AS group_ids,
           array_remove(array_agg(DISTINCT s.group_name), NULL) AS group_names
    FROM src s
    GROUP BY s.headset_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'headset_id', h.id, 'headset_name', h.name, 'status', h.status,
    'desired', h.desired_manifest_version, 'applied', h.applied_manifest_version,
    'impact_paths', to_jsonb(agg.impact_paths),
    'group_ids', to_jsonb(agg.group_ids),
    'group_names', to_jsonb(agg.group_names)
  ) ORDER BY h.name), '[]'::jsonb) INTO _impacted
  FROM agg JOIN public.headsets h ON h.id = agg.headset_id;

  SELECT count(*) INTO _trigger_count FROM public.headsets_for_playlist(_playlist_id);

  _result := jsonb_build_object(
    'playlist', _playlist,
    'assignments', jsonb_build_object('direct', _direct, 'group', _group, 'all', _all),
    'impacted_headsets', _impacted,
    'trigger_target_count', _trigger_count,
    'discrepancy', _trigger_count <> jsonb_array_length(_impacted)
  );
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.diagnose_playlist_impact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diagnose_playlist_impact(uuid) TO authenticated;
