
-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('admin', 'operator');
CREATE TYPE public.library_type AS ENUM ('location', 'animation');
CREATE TYPE public.vr_format AS ENUM ('360_mono', '180_mono', '360_stereo', '180_stereo', 'flat');
CREATE TYPE public.agent_platform AS ENUM ('windows', 'macos', 'linux');
CREATE TYPE public.sync_job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== AUTO PROFILE + ROLE on signup =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count <= 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operator');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== VIDEOS (shared library) =====
CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  library public.library_type NOT NULL DEFAULT 'location',
  format public.vr_format NOT NULL DEFAULT '360_mono',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_seconds NUMERIC,
  storage_path TEXT NOT NULL UNIQUE,
  thumbnail_url TEXT,
  description TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated can view videos" ON public.videos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage videos" ON public.videos FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update videos" ON public.videos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete videos" ON public.videos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_videos_library ON public.videos(library);

-- ===== AGENTS =====
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My PC',
  pairing_code TEXT UNIQUE,
  pairing_expires_at TIMESTAMPTZ,
  paired_at TIMESTAMPTZ,
  token TEXT UNIQUE,
  platform public.agent_platform,
  version TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own agents" ON public.agents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own agents" ON public.agents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own agents" ON public.agents FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own agents" ON public.agents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== DEVICES (Quest headsets reported by agents) =====
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  serial TEXT NOT NULL,
  model TEXT,
  ip_address TEXT,
  battery INT,
  storage_total_gb NUMERIC,
  storage_used_gb NUMERIC,
  status TEXT DEFAULT 'unknown',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, serial)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own devices" ON public.devices FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = devices.agent_id AND a.user_id = auth.uid()));
CREATE POLICY "Users manage own devices" ON public.devices FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = devices.agent_id AND a.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = devices.agent_id AND a.user_id = auth.uid()));

-- ===== SYNC JOBS =====
CREATE TABLE public.sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  device_serial TEXT NOT NULL,
  video_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  status public.sync_job_status NOT NULL DEFAULT 'pending',
  progress_pct INT NOT NULL DEFAULT 0,
  pushed INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  log TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_jobs TO authenticated;
GRANT ALL ON public.sync_jobs TO service_role;
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own jobs" ON public.sync_jobs FOR SELECT TO authenticated USING (auth.uid() = created_by OR EXISTS (SELECT 1 FROM public.agents a WHERE a.id = sync_jobs.agent_id AND a.user_id = auth.uid()));
CREATE POLICY "Users create own jobs" ON public.sync_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.agents a WHERE a.id = sync_jobs.agent_id AND a.user_id = auth.uid()));
CREATE POLICY "Users update own jobs" ON public.sync_jobs FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = sync_jobs.agent_id AND a.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = sync_jobs.agent_id AND a.user_id = auth.uid()));
CREATE INDEX idx_sync_jobs_agent_status ON public.sync_jobs(agent_id, status);

-- ===== updated_at trigger helper =====
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER touch_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_videos_updated BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== STORAGE policies on 'videos' bucket =====
CREATE POLICY "Authenticated read videos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'videos');
CREATE POLICY "Admins upload videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'videos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update videos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'videos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'videos' AND public.has_role(auth.uid(), 'admin'));

-- ===== REALTIME =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
