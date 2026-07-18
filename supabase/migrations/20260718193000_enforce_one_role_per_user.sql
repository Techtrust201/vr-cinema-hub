-- Enforce exactly one role row per user.
-- Prefer admin over operator when cleaning historical duplicates.
-- First auth user still bootstraps as admin; subsequent users get no role
-- until an admin assigns one (invitation flow).

-- 1) Collapse duplicates: keep admin if present, else the oldest operator row.
WITH ranked AS (
  SELECT
    id,
    user_id,
    role,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE role WHEN 'admin' THEN 0 ELSE 1 END,
        created_at ASC NULLS LAST,
        id ASC
    ) AS rn
  FROM public.user_roles
)
DELETE FROM public.user_roles ur
USING ranked r
WHERE ur.id = r.id
  AND r.rn > 1;

-- 2) Replace composite uniqueness with one-role-per-user.
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_roles_user_id_key'
      AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 3) Deterministic role lookup (admin preferred; null if none).
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
  ORDER BY CASE ur.role WHEN 'admin' THEN 0 ELSE 1 END, ur.created_at ASC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;

-- 4) Upsert helper for admin promotion / invitation assignment.
CREATE OR REPLACE FUNCTION public.set_user_role(_user_id uuid, _role public.app_role)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF _user_id IS NULL OR _role IS NULL THEN
    RAISE EXCEPTION 'user_id and role are required';
  END IF;

  INSERT INTO public.user_roles AS ur (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role
  RETURNING ur.role INTO v_role;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role) TO service_role;

-- 5) Bootstrap-only role assignment: first user admin, later users no role.
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
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;
  -- No default operator role: users without a role are unauthorized.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
