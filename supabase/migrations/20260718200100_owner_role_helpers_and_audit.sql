-- Professional access model: owner / admin / operator (uses owner enum)
-- - one role per user (already enforced)
-- - at least one owner when owners exist; last-owner protection
-- - content ops: owner | admin | operator
-- - member management: owner | admin (with owner-only transfer)
-- - audit log for role changes


-- 2) Role helpers
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_content(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role IN ('owner', 'admin', 'operator')
  );
$$;

REVOKE ALL ON FUNCTION public.is_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_or_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_content(uuid) TO authenticated, service_role;

-- 3) Deterministic role lookup: owner > admin > operator
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles AS ur
  WHERE ur.user_id = _user_id
  ORDER BY
    CASE ur.role
      WHEN 'owner' THEN 0
      WHEN 'admin' THEN 1
      ELSE 2
    END,
    ur.created_at ASC NULLS LAST
  LIMIT 1;
$$;

-- 4) Bootstrap: first user becomes owner (not admin)
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
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count <= 1 THEN
    INSERT INTO public.user_roles AS ur (user_id, role)
    VALUES (NEW.id, 'owner')
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 5) Audit table
CREATE TABLE IF NOT EXISTS public.organization_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  old_role public.app_role,
  new_role public.app_role,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_audit_logs_created_at_idx
  ON public.organization_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS organization_audit_logs_actor_idx
  ON public.organization_audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS organization_audit_logs_target_idx
  ON public.organization_audit_logs (target_user_id);

GRANT SELECT ON public.organization_audit_logs TO authenticated;
GRANT ALL ON public.organization_audit_logs TO service_role;
ALTER TABLE public.organization_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read all audit logs" ON public.organization_audit_logs;
CREATE POLICY "Owners read all audit logs"
  ON public.organization_audit_logs FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "Admins read non-sensitive audit logs" ON public.organization_audit_logs;
CREATE POLICY "Admins read non-sensitive audit logs"
  ON public.organization_audit_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND action NOT IN ('transfer_ownership', 'bootstrap_owner', 'promote_owner')
  );

-- No INSERT/UPDATE/DELETE for authenticated — service_role / SECURITY DEFINER only.

-- 6) Safe role change with ownership safeguards + audit
CREATE OR REPLACE FUNCTION public.apply_member_role_change(
  _actor_user_id uuid,
  _target_user_id uuid,
  _new_role public.app_role,
  _action text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role public.app_role;
  v_old_role public.app_role;
  v_owner_count int;
  v_result public.app_role;
BEGIN
  IF _actor_user_id IS NULL OR _target_user_id IS NULL OR _new_role IS NULL THEN
    RAISE EXCEPTION 'actor, target and new_role are required';
  END IF;

  v_actor_role := public.get_user_role(_actor_user_id);
  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'actor_unauthorized';
  END IF;

  SELECT ur.role INTO v_old_role
  FROM public.user_roles ur
  WHERE ur.user_id = _target_user_id;

  SELECT COUNT(*) INTO v_owner_count
  FROM public.user_roles ur
  WHERE ur.role = 'owner';

  -- Operators cannot manage members
  IF v_actor_role = 'operator' THEN
    RAISE EXCEPTION 'forbidden_operator';
  END IF;

  -- Admin cannot create/promote/transfer owner, nor touch an owner
  IF v_actor_role = 'admin' THEN
    IF _new_role = 'owner' THEN
      RAISE EXCEPTION 'admin_cannot_create_owner';
    END IF;
    IF v_old_role = 'owner' THEN
      RAISE EXCEPTION 'admin_cannot_modify_owner';
    END IF;
    IF _action IN ('transfer_ownership', 'promote_owner', 'bootstrap_owner') THEN
      RAISE EXCEPTION 'admin_forbidden_action';
    END IF;
  END IF;

  -- Transfer ownership: owner only, atomic swap
  IF _action = 'transfer_ownership' THEN
    IF v_actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'only_owner_can_transfer';
    END IF;
    IF _new_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'transfer_requires_owner_role';
    END IF;
    IF _target_user_id = _actor_user_id THEN
      RAISE EXCEPTION 'cannot_transfer_to_self';
    END IF;

    -- Demote actor to admin, promote target to owner
    INSERT INTO public.user_roles AS ur (user_id, role)
    VALUES (_target_user_id, 'owner')
    ON CONFLICT (user_id) DO UPDATE SET role = 'owner';

    INSERT INTO public.user_roles AS ur (user_id, role)
    VALUES (_actor_user_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

    INSERT INTO public.organization_audit_logs (actor_user_id, target_user_id, action, old_role, new_role, metadata)
    VALUES (_actor_user_id, _target_user_id, 'transfer_ownership', v_old_role, 'owner', COALESCE(_metadata, '{}'::jsonb));

    INSERT INTO public.organization_audit_logs (actor_user_id, target_user_id, action, old_role, new_role, metadata)
    VALUES (_actor_user_id, _actor_user_id, 'transfer_ownership_self', 'owner', 'admin', COALESCE(_metadata, '{}'::jsonb));

    RETURN 'owner'::public.app_role;
  END IF;

  -- Last-owner protection
  IF v_old_role = 'owner' AND _new_role IS DISTINCT FROM 'owner' THEN
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'cannot_remove_last_owner';
    END IF;
    IF v_actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'only_owner_can_demote_owner';
    END IF;
  END IF;

  IF _new_role = 'owner' AND v_actor_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only_owner_can_promote_owner';
  END IF;

  INSERT INTO public.user_roles AS ur (user_id, role)
  VALUES (_target_user_id, _new_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role
  RETURNING ur.role INTO v_result;

  INSERT INTO public.organization_audit_logs (actor_user_id, target_user_id, action, old_role, new_role, metadata)
  VALUES (_actor_user_id, _target_user_id, COALESCE(NULLIF(_action, ''), 'set_role'), v_old_role, v_result, COALESCE(_metadata, '{}'::jsonb));

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_member_role_change(uuid, uuid, public.app_role, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_member_role_change(uuid, uuid, public.app_role, text, jsonb) TO service_role;

-- Remove role (with last-owner guard) + audit
CREATE OR REPLACE FUNCTION public.remove_member_role(
  _actor_user_id uuid,
  _target_user_id uuid,
  _action text DEFAULT 'remove',
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role public.app_role;
  v_old_role public.app_role;
  v_owner_count int;
BEGIN
  v_actor_role := public.get_user_role(_actor_user_id);
  IF v_actor_role IS NULL OR v_actor_role = 'operator' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT ur.role INTO v_old_role FROM public.user_roles ur WHERE ur.user_id = _target_user_id;
  IF v_old_role IS NULL THEN
    RETURN;
  END IF;

  IF v_old_role = 'owner' THEN
    IF v_actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'admin_cannot_modify_owner';
    END IF;
    SELECT COUNT(*) INTO v_owner_count FROM public.user_roles ur WHERE ur.role = 'owner';
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'cannot_remove_last_owner';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;

  INSERT INTO public.organization_audit_logs (actor_user_id, target_user_id, action, old_role, new_role, metadata)
  VALUES (_actor_user_id, _target_user_id, COALESCE(NULLIF(_action, ''), 'remove'), v_old_role, NULL, COALESCE(_metadata, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.remove_member_role(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_member_role(uuid, uuid, text, jsonb) TO service_role;

-- 7) Tighten user_roles writes: authenticated can no longer manage roles directly
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins and owners can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

-- Keep own-role select
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 8) Content policies: owner | admin | operator can manage content
-- videos
DROP POLICY IF EXISTS "Admins manage videos" ON public.videos;
DROP POLICY IF EXISTS "Admins update videos" ON public.videos;
DROP POLICY IF EXISTS "Admins delete videos" ON public.videos;
CREATE POLICY "Content managers insert videos"
  ON public.videos FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_content(auth.uid()));
CREATE POLICY "Content managers update videos"
  ON public.videos FOR UPDATE TO authenticated
  USING (public.can_manage_content(auth.uid()))
  WITH CHECK (public.can_manage_content(auth.uid()));
CREATE POLICY "Content managers delete videos"
  ON public.videos FOR DELETE TO authenticated
  USING (public.can_manage_content(auth.uid()));

-- storage
DROP POLICY IF EXISTS "Admins upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins update videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete videos" ON storage.objects;
CREATE POLICY "Content managers upload videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'videos' AND public.can_manage_content(auth.uid()));
CREATE POLICY "Content managers update video objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'videos' AND public.can_manage_content(auth.uid()));
CREATE POLICY "Content managers delete video objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'videos' AND public.can_manage_content(auth.uid()));

-- headsets / groups / playlists / assignments
DROP POLICY IF EXISTS "Admins manage headsets" ON public.headsets;
CREATE POLICY "Content managers manage headsets"
  ON public.headsets FOR ALL TO authenticated
  USING (public.can_manage_content(auth.uid()))
  WITH CHECK (public.can_manage_content(auth.uid()));

DROP POLICY IF EXISTS "Admins manage groups" ON public.headset_groups;
CREATE POLICY "Content managers manage groups"
  ON public.headset_groups FOR ALL TO authenticated
  USING (public.can_manage_content(auth.uid()))
  WITH CHECK (public.can_manage_content(auth.uid()));

DROP POLICY IF EXISTS "Admins manage group members" ON public.headset_group_members;
CREATE POLICY "Content managers manage group members"
  ON public.headset_group_members FOR ALL TO authenticated
  USING (public.can_manage_content(auth.uid()))
  WITH CHECK (public.can_manage_content(auth.uid()));

DROP POLICY IF EXISTS "Admins manage playlists" ON public.playlists;
CREATE POLICY "Content managers manage playlists"
  ON public.playlists FOR ALL TO authenticated
  USING (public.can_manage_content(auth.uid()))
  WITH CHECK (public.can_manage_content(auth.uid()));

DROP POLICY IF EXISTS "Admins manage playlist videos" ON public.playlist_videos;
CREATE POLICY "Content managers manage playlist videos"
  ON public.playlist_videos FOR ALL TO authenticated
  USING (public.can_manage_content(auth.uid()))
  WITH CHECK (public.can_manage_content(auth.uid()));

DROP POLICY IF EXISTS "Admins manage assignments" ON public.assignments;
CREATE POLICY "Content managers manage assignments"
  ON public.assignments FOR ALL TO authenticated
  USING (public.can_manage_content(auth.uid()))
  WITH CHECK (public.can_manage_content(auth.uid()));

-- 9) Bootstrap staging continuity: if no owner exists, promote oldest admin to owner
DO $$
DECLARE
  v_uid uuid;
  v_old public.app_role;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    SELECT ur.user_id, ur.role INTO v_uid, v_old
    FROM public.user_roles ur
    WHERE ur.role = 'admin'
    ORDER BY ur.created_at ASC NULLS LAST
    LIMIT 1;

    IF v_uid IS NOT NULL THEN
      UPDATE public.user_roles SET role = 'owner' WHERE user_id = v_uid;
      INSERT INTO public.organization_audit_logs (actor_user_id, target_user_id, action, old_role, new_role, metadata)
      VALUES (
        v_uid, v_uid, 'bootstrap_owner', v_old, 'owner',
        jsonb_build_object('reason', 'no_owner_present_after_migration')
      );
    END IF;
  END IF;
END $$;
