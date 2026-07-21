-- Authenticated wrappers for owner/admin member management (actor = auth.uid()).

CREATE OR REPLACE FUNCTION public.change_my_org_member_role(
  _target_user_id uuid,
  _new_role public.app_role,
  _action text DEFAULT 'set_role'
)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  RETURN public.apply_member_role_change(
    auth.uid(),
    _target_user_id,
    _new_role,
    COALESCE(NULLIF(_action, ''), 'set_role'),
    '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.change_my_org_member_role(uuid, public.app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_my_org_member_role(uuid, public.app_role, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.remove_my_org_member_role(
  _target_user_id uuid,
  _action text DEFAULT 'remove'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  PERFORM public.remove_member_role(
    auth.uid(),
    _target_user_id,
    COALESCE(NULLIF(_action, ''), 'remove'),
    '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_my_org_member_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_my_org_member_role(uuid, text) TO authenticated, service_role;

-- Directory of org members for owner/admin Settings UI
CREATE OR REPLACE FUNCTION public.list_organization_members()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  role public.app_role,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text,
    COALESCE(p.display_name, split_part(u.email, '@', 1)) AS display_name,
    ur.role,
    ur.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  ORDER BY
    CASE ur.role
      WHEN 'owner' THEN 0
      WHEN 'admin' THEN 1
      WHEN 'operator' THEN 2
      ELSE 3
    END,
    u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_organization_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_organization_members() TO authenticated, service_role;
