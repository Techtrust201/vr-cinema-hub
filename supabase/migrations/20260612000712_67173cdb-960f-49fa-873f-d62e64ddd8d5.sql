
-- 1. Track last bump cause per headset
ALTER TABLE public.headsets
  ADD COLUMN IF NOT EXISTS last_manifest_cause text;

-- 2. bump_headset_versions writes the cause
CREATE OR REPLACE FUNCTION public.bump_headset_versions(_headset_ids uuid[], _cause text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _headset_ids IS NULL OR array_length(_headset_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.headsets
     SET desired_manifest_version = desired_manifest_version + 1,
         last_manifest_cause = _cause,
         updated_at = now()
   WHERE id = ANY(_headset_ids);
  RAISE NOTICE '[WebSync] bump cause=% headsets=%', _cause, _headset_ids;
END;
$function$;

-- 3. Triggers: OLD ∪ NEW

-- assignments
CREATE OR REPLACE FUNCTION public.trg_assignments_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ids uuid[] := ARRAY[]::uuid[];
  _tmp uuid[];
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.target_type END,
       CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.target_id END),
      (CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN NEW.target_type END,
       CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN NEW.target_id END)
    ) AS t(target_type, target_id)
    WHERE t.target_type IS NOT NULL
  LOOP
    IF r.target_type = 'all' THEN
      SELECT array_agg(id) INTO _tmp FROM public.headsets WHERE status = 'active';
    ELSIF r.target_type = 'headset' THEN
      _tmp := ARRAY[r.target_id];
    ELSIF r.target_type = 'group' THEN
      SELECT array_agg(headset_id) INTO _tmp FROM public.headset_group_members WHERE group_id = r.target_id;
    ELSE
      _tmp := ARRAY[]::uuid[];
    END IF;
    IF _tmp IS NOT NULL THEN
      _ids := _ids || _tmp;
    END IF;
  END LOOP;

  -- dedup
  SELECT array_agg(DISTINCT x) INTO _ids FROM unnest(_ids) x WHERE x IS NOT NULL;
  PERFORM public.bump_headset_versions(_ids, 'assignment_' || TG_OP);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- playlist_videos
CREATE OR REPLACE FUNCTION public.trg_playlist_videos_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ids uuid[];
  _pids uuid[];
BEGIN
  _pids := ARRAY[]::uuid[];
  IF TG_OP IN ('UPDATE','DELETE') THEN _pids := _pids || OLD.playlist_id; END IF;
  IF TG_OP IN ('UPDATE','INSERT') THEN _pids := _pids || NEW.playlist_id; END IF;
  SELECT array_agg(DISTINCT hp.headset_id) INTO _ids
    FROM unnest(_pids) p
    CROSS JOIN LATERAL public.headsets_for_playlist(p) hp;
  PERFORM public.bump_headset_versions(_ids, 'playlist_videos_' || TG_OP);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- headset_group_members
CREATE OR REPLACE FUNCTION public.trg_group_members_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN _ids := _ids || OLD.headset_id; END IF;
  IF TG_OP IN ('UPDATE','INSERT') THEN _ids := _ids || NEW.headset_id; END IF;
  SELECT array_agg(DISTINCT x) INTO _ids FROM unnest(_ids) x WHERE x IS NOT NULL;
  PERFORM public.bump_headset_versions(_ids, 'group_members_' || TG_OP);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- videos (extended columns watched)
CREATE OR REPLACE FUNCTION public.trg_videos_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ids uuid[];
  _vid uuid := COALESCE(NEW.id, OLD.id);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path
       AND NEW.projection IS NOT DISTINCT FROM OLD.projection
       AND NEW.stereo_mode IS NOT DISTINCT FROM OLD.stereo_mode
       AND NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.format IS NOT DISTINCT FROM OLD.format
       AND NEW.size_bytes IS NOT DISTINCT FROM OLD.size_bytes
       AND NEW.duration_seconds IS NOT DISTINCT FROM OLD.duration_seconds THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT array_agg(DISTINCT hp.headset_id) INTO _ids
    FROM public.playlist_videos pv
    CROSS JOIN LATERAL public.headsets_for_playlist(pv.playlist_id) hp
    WHERE pv.video_id = _vid;

  PERFORM public.bump_headset_versions(_ids, 'video_' || TG_OP);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 4. RLS: manifest_versions read = admin only
DROP POLICY IF EXISTS manifest_versions_read_authenticated ON public.manifest_versions;
DROP POLICY IF EXISTS manifest_versions_admin_read ON public.manifest_versions;
CREATE POLICY manifest_versions_admin_read ON public.manifest_versions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Initial bump for active headsets so they start at desired=1, applied=0
DO $$
DECLARE
  _ids uuid[];
BEGIN
  SELECT array_agg(id) INTO _ids FROM public.headsets WHERE status = 'active' AND desired_manifest_version = 0;
  IF _ids IS NOT NULL THEN
    PERFORM public.bump_headset_versions(_ids, 'initial_versioning_migration');
  END IF;
END $$;
