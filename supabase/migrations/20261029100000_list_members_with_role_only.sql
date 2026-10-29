-- Retirer un accès effaçait bien le rôle, mais la liste repartait de tous les comptes
-- du site, y compris ceux qui n'ont plus de rôle. L'écran les montrait alors comme
-- opérateurs. Seuls les comptes qui ont encore un accès apparaissent.

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
  JOIN public.user_roles ur ON ur.user_id = u.id
  LEFT JOIN public.profiles p ON p.id = u.id
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
