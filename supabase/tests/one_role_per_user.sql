-- SQL assertions for one-role-per-user (run against local DB after migrations).
-- Usage: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/one_role_per_user.sql

BEGIN;

DO $$
DECLARE
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  r public.app_role;
  n int;
BEGIN
  -- Fake auth.users rows (minimal columns for FK).
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES
    (u1, 'authenticated', 'authenticated', 'role-test-1@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '', '', '', ''),
    (u2, 'authenticated', 'authenticated', 'role-test-2@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '', '', '', ''),
    (u3, 'authenticated', 'authenticated', 'role-test-3@example.test', crypt('x', gen_salt('bf')), now(), now(), now(), '00000000-0000-0000-0000-000000000000', '', '', '', '');

  -- Normal assign → single role
  PERFORM public.set_user_role(u1, 'operator');
  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = u1;
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 role after set_user_role, got %', n; END IF;
  IF public.get_user_role(u1) IS DISTINCT FROM 'operator' THEN
    RAISE EXCEPTION 'get_user_role mismatch for operator';
  END IF;

  -- Promotion operator → admin keeps one row
  PERFORM public.set_user_role(u1, 'admin');
  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = u1;
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 role after promotion, got %', n; END IF;
  IF public.get_user_role(u1) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'get_user_role mismatch for admin';
  END IF;

  -- Second raw insert must conflict
  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (u1, 'operator');
    RAISE EXCEPTION 'second insert should have failed';
  EXCEPTION
    WHEN unique_violation THEN
      NULL; -- expected
  END;

  -- No role → get_user_role null; has_role false
  IF public.get_user_role(u2) IS NOT NULL THEN
    RAISE EXCEPTION 'user without role should return null';
  END IF;
  IF public.has_role(u2, 'admin') OR public.has_role(u2, 'operator') THEN
    RAISE EXCEPTION 'user without role must not pass has_role';
  END IF;

  -- Admin authorized
  PERFORM public.set_user_role(u3, 'admin');
  IF NOT public.has_role(u3, 'admin') THEN
    RAISE EXCEPTION 'admin should pass has_role';
  END IF;
  IF public.get_user_role(u3) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin get_user_role failed';
  END IF;

  RAISE NOTICE 'one_role_per_user SQL tests PASSED';
END $$;

ROLLBACK;
