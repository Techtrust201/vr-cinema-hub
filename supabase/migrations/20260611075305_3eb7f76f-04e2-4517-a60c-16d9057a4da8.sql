
-- Enums
CREATE TYPE public.headset_status AS ENUM ('pending', 'active', 'revoked');
CREATE TYPE public.assignment_target AS ENUM ('headset', 'group', 'all');
CREATE TYPE public.sync_status AS ENUM ('started', 'success', 'partial', 'failed');

-- =========================================================================
-- HEADSETS
-- =========================================================================
CREATE TABLE public.headsets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  serial TEXT,
  model TEXT,
  status public.headset_status NOT NULL DEFAULT 'pending',
  last_seen_at TIMESTAMPTZ,
  storage_free_bytes BIGINT,
  storage_total_bytes BIGINT,
  battery_percent INT,
  app_version TEXT,
  paired_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  paired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.headsets TO authenticated;
GRANT ALL ON public.headsets TO service_role;

ALTER TABLE public.headsets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view headsets"
  ON public.headsets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage headsets"
  ON public.headsets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_headsets_updated_at
  BEFORE UPDATE ON public.headsets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- HEADSET GROUPS
-- =========================================================================
CREATE TABLE public.headset_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.headset_groups TO authenticated;
GRANT ALL ON public.headset_groups TO service_role;
ALTER TABLE public.headset_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view groups"
  ON public.headset_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage groups"
  ON public.headset_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_groups_updated_at
  BEFORE UPDATE ON public.headset_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.headset_group_members (
  group_id UUID NOT NULL REFERENCES public.headset_groups(id) ON DELETE CASCADE,
  headset_id UUID NOT NULL REFERENCES public.headsets(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, headset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.headset_group_members TO authenticated;
GRANT ALL ON public.headset_group_members TO service_role;
ALTER TABLE public.headset_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view group members"
  ON public.headset_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage group members"
  ON public.headset_group_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- PLAYLISTS
-- =========================================================================
CREATE TABLE public.playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT ALL ON public.playlists TO service_role;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view playlists"
  ON public.playlists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage playlists"
  ON public.playlists FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_playlists_updated_at
  BEFORE UPDATE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.playlist_videos (
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, video_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_videos TO authenticated;
GRANT ALL ON public.playlist_videos TO service_role;
ALTER TABLE public.playlist_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view playlist videos"
  ON public.playlist_videos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage playlist videos"
  ON public.playlist_videos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- ASSIGNMENTS
-- =========================================================================
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  target_type public.assignment_target NOT NULL,
  target_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assignments_target_consistency
    CHECK ((target_type = 'all' AND target_id IS NULL) OR (target_type <> 'all' AND target_id IS NOT NULL))
);
CREATE UNIQUE INDEX assignments_unique_idx
  ON public.assignments (playlist_id, target_type, COALESCE(target_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view assignments"
  ON public.assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage assignments"
  ON public.assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- PAIRING CODES
-- =========================================================================
CREATE TABLE public.pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_by_headset_id UUID REFERENCES public.headsets(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  failed_attempts INT NOT NULL DEFAULT 0,
  pending_serial TEXT,
  pending_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pairing_codes_code_idx ON public.pairing_codes (code);
GRANT SELECT ON public.pairing_codes TO authenticated;
GRANT ALL ON public.pairing_codes TO service_role;
ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view pairing codes"
  ON public.pairing_codes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- SYNC REPORTS
-- =========================================================================
CREATE TABLE public.sync_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  headset_id UUID NOT NULL REFERENCES public.headsets(id) ON DELETE CASCADE,
  status public.sync_status NOT NULL DEFAULT 'started',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  downloaded_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  deleted_count INT NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  error_message TEXT,
  details JSONB
);
CREATE INDEX sync_reports_headset_started_idx ON public.sync_reports (headset_id, started_at DESC);

GRANT SELECT ON public.sync_reports TO authenticated;
GRANT ALL ON public.sync_reports TO service_role;
ALTER TABLE public.sync_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view sync reports"
  ON public.sync_reports FOR SELECT TO authenticated USING (true);

-- =========================================================================
-- REALTIME
-- =========================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.headsets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_reports;
