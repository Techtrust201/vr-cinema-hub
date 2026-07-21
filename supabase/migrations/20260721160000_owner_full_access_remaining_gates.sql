-- Owner is the org superuser: must pass every historical admin-only gate,
-- and must be able to see org-wide rows that were previously per-user scoped.

-- 1) Legacy has_role('admin'): owner inherits admin (exact role match still wins)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role = _role
        OR (ur.role = 'owner' AND _role = 'admin')
      )
  );
$$;

-- 2) pairing_codes: was admin-only SELECT (owner blocked until now)
DROP POLICY IF EXISTS "Admins can view pairing codes" ON public.pairing_codes;
DROP POLICY IF EXISTS "Content managers can view pairing codes" ON public.pairing_codes;
CREATE POLICY "Content managers can view pairing codes"
  ON public.pairing_codes FOR SELECT TO authenticated
  USING (public.can_manage_content(auth.uid()));

-- 3) Org-wide visibility for legacy per-user tables (owner sees everyone)
DROP POLICY IF EXISTS "Owners can view all agents" ON public.agents;
CREATE POLICY "Owners can view all agents"
  ON public.agents FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage all agents" ON public.agents;
CREATE POLICY "Owners can manage all agents"
  ON public.agents FOR ALL TO authenticated
  USING (public.is_owner(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "Owners can view all devices" ON public.devices;
CREATE POLICY "Owners can view all devices"
  ON public.devices FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage all devices" ON public.devices;
CREATE POLICY "Owners can manage all devices"
  ON public.devices FOR ALL TO authenticated
  USING (public.is_owner(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "Owners can view all sync jobs" ON public.sync_jobs;
CREATE POLICY "Owners can view all sync jobs"
  ON public.sync_jobs FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage all sync jobs" ON public.sync_jobs;
CREATE POLICY "Owners can manage all sync jobs"
  ON public.sync_jobs FOR ALL TO authenticated
  USING (public.is_owner(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()));
