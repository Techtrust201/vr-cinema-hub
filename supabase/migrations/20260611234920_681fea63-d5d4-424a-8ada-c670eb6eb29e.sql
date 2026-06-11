
-- 1. Extend sync_status enum
ALTER TYPE public.sync_status ADD VALUE IF NOT EXISTS 'no_change';
ALTER TYPE public.sync_status ADD VALUE IF NOT EXISTS 'pending';

-- 2. Headset versioning columns
ALTER TABLE public.headsets
  ADD COLUMN IF NOT EXISTS desired_manifest_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applied_manifest_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_manifest_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_status public.sync_status,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- 3. sync_reports extensions
ALTER TABLE public.sync_reports
  ADD COLUMN IF NOT EXISTS applied_manifest_version BIGINT,
  ADD COLUMN IF NOT EXISTS playlist_id UUID,
  ADD COLUMN IF NOT EXISTS remote_video_count INTEGER,
  ADD COLUMN IF NOT EXISTS local_video_count INTEGER,
  ADD COLUMN IF NOT EXISTS visible_video_count INTEGER,
  ADD COLUMN IF NOT EXISTS cause TEXT;

-- 4. manifest_versions snapshot table
CREATE TABLE IF NOT EXISTS public.manifest_versions (
  headset_id UUID NOT NULL REFERENCES public.headsets(id) ON DELETE CASCADE,
  version BIGINT NOT NULL,
  playlist_id UUID,
  cause TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (headset_id, version)
);

GRANT SELECT ON public.manifest_versions TO authenticated;
GRANT ALL ON public.manifest_versions TO service_role;

ALTER TABLE public.manifest_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manifest_versions_read_authenticated"
  ON public.manifest_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS manifest_versions_headset_created_idx
  ON public.manifest_versions (headset_id, created_at DESC);

-- 5. bump_headset_versions
CREATE OR REPLACE FUNCTION public.bump_headset_versions(_headset_ids uuid[], _cause text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _headset_ids IS NULL OR array_length(_headset_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.headsets
     SET desired_manifest_version = desired_manifest_version + 1,
         updated_at = now()
   WHERE id = ANY(_headset_ids);
  RAISE NOTICE '[WebSync] bump cause=% headsets=%', _cause, _headset_ids;
END;
$$;

-- 6. Helper: headsets impacted by a given playlist_id
CREATE OR REPLACE FUNCTION public.headsets_for_playlist(_playlist_id uuid)
RETURNS TABLE(headset_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT h.id
  FROM public.headsets h
  WHERE h.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.playlist_id = _playlist_id
        AND (
          a.target_type = 'all'
          OR (a.target_type = 'headset' AND a.target_id = h.id)
          OR (a.target_type = 'group' AND a.target_id IN (
                SELECT group_id FROM public.headset_group_members WHERE headset_id = h.id
             ))
        )
    );
$$;

-- 7. Triggers

-- 7a. playlist_videos
CREATE OR REPLACE FUNCTION public.trg_playlist_videos_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ids uuid[];
  _pid uuid := COALESCE(NEW.playlist_id, OLD.playlist_id);
BEGIN
  SELECT array_agg(headset_id) INTO _ids FROM public.headsets_for_playlist(_pid);
  PERFORM public.bump_headset_versions(_ids, 'playlist_videos_' || TG_OP);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS playlist_videos_invalidate ON public.playlist_videos;
CREATE TRIGGER playlist_videos_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON public.playlist_videos
  FOR EACH ROW EXECUTE FUNCTION public.trg_playlist_videos_invalidate();

-- 7b. assignments
CREATE OR REPLACE FUNCTION public.trg_assignments_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ids uuid[];
  r record;
BEGIN
  FOR r IN
    SELECT target_type, target_id, playlist_id
    FROM (VALUES
      (COALESCE(NEW.target_type, OLD.target_type), COALESCE(NEW.target_id, OLD.target_id), COALESCE(NEW.playlist_id, OLD.playlist_id))
    ) AS t(target_type, target_id, playlist_id)
  LOOP
    IF r.target_type = 'all' THEN
      SELECT array_agg(id) INTO _ids FROM public.headsets WHERE status = 'active';
    ELSIF r.target_type = 'headset' THEN
      _ids := ARRAY[r.target_id];
    ELSIF r.target_type = 'group' THEN
      SELECT array_agg(headset_id) INTO _ids FROM public.headset_group_members WHERE group_id = r.target_id;
    END IF;
    PERFORM public.bump_headset_versions(_ids, 'assignment_' || TG_OP);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS assignments_invalidate ON public.assignments;
CREATE TRIGGER assignments_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.trg_assignments_invalidate();

-- 7c. headset_group_members
CREATE OR REPLACE FUNCTION public.trg_group_members_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hid uuid := COALESCE(NEW.headset_id, OLD.headset_id);
BEGIN
  PERFORM public.bump_headset_versions(ARRAY[_hid], 'group_members_' || TG_OP);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS group_members_invalidate ON public.headset_group_members;
CREATE TRIGGER group_members_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON public.headset_group_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_group_members_invalidate();

-- 7d. videos (when content metadata changes)
CREATE OR REPLACE FUNCTION public.trg_videos_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ids uuid[];
  _vid uuid := COALESCE(NEW.id, OLD.id);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path
       AND NEW.projection IS NOT DISTINCT FROM OLD.projection
       AND NEW.stereo_mode IS NOT DISTINCT FROM OLD.stereo_mode
       AND NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.format IS NOT DISTINCT FROM OLD.format THEN
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
$$;

DROP TRIGGER IF EXISTS videos_invalidate ON public.videos;
CREATE TRIGGER videos_invalidate
  AFTER UPDATE OR DELETE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.trg_videos_invalidate();
