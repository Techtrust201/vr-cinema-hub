-- SQL assertions for playlist ordering (run against local DB after migrations).
-- Usage: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/playlist_order.sql
--
-- Vérifie que l'ordre défini sur le tableau de bord atteint les casques, et qu'un
-- réordonnancement n'incrémente leur version qu'une fois.

BEGIN;

CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid NOT NULL) ON COMMIT DROP;
GRANT SELECT ON ids TO authenticated;

DO $$
DECLARE
  editor uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  h uuid;
  pa uuid;
  pb uuid;
  v1 uuid;
  v2 uuid;
  v3 uuid;
  first_pos int;
  second_pos int;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, instance_id)
  VALUES
    (editor, 'authenticated', 'authenticated', 'order-editor@example.test', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (stranger, 'authenticated', 'authenticated', 'order-stranger@example.test', now(), now(), '00000000-0000-0000-0000-000000000000');
  DELETE FROM public.user_roles WHERE user_id IN (editor, stranger);
  INSERT INTO public.user_roles (user_id, role) VALUES (editor, 'operator');

  -- Tri naturel : « Voyage 2 » avant « Voyage 10 ».
  IF NOT ('Voyage 2' COLLATE public.fr_natural < 'Voyage 10' COLLATE public.fr_natural) THEN
    RAISE EXCEPTION 'fr_natural should sort Voyage 2 before Voyage 10';
  END IF;

  -- Une playlist créée sans position se range après les autres.
  INSERT INTO public.playlists (name) VALUES ('Voyage 2 - Paris') RETURNING id, position INTO pa, first_pos;
  INSERT INTO public.playlists (name) VALUES ('Voyage 1 - Venise') RETURNING id, position INTO pb, second_pos;
  IF second_pos <> first_pos + 1 THEN
    RAISE EXCEPTION 'new playlist should be appended: % then %', first_pos, second_pos;
  END IF;

  INSERT INTO public.headsets (name, status) VALUES ('Casque test ordre', 'active') RETURNING id INTO h;
  INSERT INTO public.videos (name, storage_path) VALUES ('Vidéo 1.mp4', 't/1.mp4') RETURNING id INTO v1;
  INSERT INTO public.videos (name, storage_path) VALUES ('Vidéo 2.mp4', 't/2.mp4') RETURNING id INTO v2;
  INSERT INTO public.videos (name, storage_path) VALUES ('Vidéo 3.mp4', 't/3.mp4') RETURNING id INTO v3;
  INSERT INTO public.playlist_videos (playlist_id, video_id, position) VALUES (pa, v1, 1), (pa, v2, 2), (pa, v3, 3);
  INSERT INTO public.assignments (playlist_id, target_type, target_id) VALUES (pa, 'headset', h);

  INSERT INTO ids VALUES ('editor', editor), ('stranger', stranger), ('h', h), ('pa', pa), ('pb', pb),
                         ('v1', v1), ('v2', v2), ('v3', v3);
END $$;

-- Les RPC s'exécutent avec les droits de l'appelant : on se met dans sa peau.
CREATE OR REPLACE FUNCTION pg_temp.act_as(_who text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT v FROM ids WHERE k = _who), 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', (SELECT v FROM ids WHERE k = _who)::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.desired() RETURNS bigint LANGUAGE sql AS $$
  SELECT desired_manifest_version FROM public.headsets WHERE id = (SELECT v FROM ids WHERE k = 'h')
$$;

CREATE TEMP TABLE probe (k text PRIMARY KEY, n bigint) ON COMMIT DROP;
GRANT ALL ON probe TO authenticated;
INSERT INTO probe SELECT 'before', pg_temp.desired();

-- 1. Réordonner trois vidéos : nouvel ordre appliqué, une seule incrémentation.
SELECT pg_temp.act_as('editor');
SET LOCAL ROLE authenticated;
SELECT public.reorder_playlist_videos(
  (SELECT v FROM ids WHERE k = 'pa'),
  ARRAY[(SELECT v FROM ids WHERE k = 'v3'), (SELECT v FROM ids WHERE k = 'v1'), (SELECT v FROM ids WHERE k = 'v2')]
);
RESET ROLE;

DO $$
DECLARE
  got uuid[];
  before bigint := (SELECT n FROM probe WHERE k = 'before');
BEGIN
  SELECT array_agg(video_id ORDER BY position) INTO got
    FROM public.playlist_videos WHERE playlist_id = (SELECT v FROM ids WHERE k = 'pa');
  IF got <> ARRAY[(SELECT v FROM ids WHERE k = 'v3'), (SELECT v FROM ids WHERE k = 'v1'), (SELECT v FROM ids WHERE k = 'v2')] THEN
    RAISE EXCEPTION 'reorder not applied: %', got;
  END IF;
  IF pg_temp.desired() <> before + 1 THEN
    RAISE EXCEPTION 'reorder should bump once: before=% after=%', before, pg_temp.desired();
  END IF;
  UPDATE probe SET n = pg_temp.desired() WHERE k = 'before';
END $$;

-- 2. Renvoyer le même ordre ne réveille pas les casques.
SELECT pg_temp.act_as('editor');
SET LOCAL ROLE authenticated;
SELECT public.reorder_playlist_videos(
  (SELECT v FROM ids WHERE k = 'pa'),
  ARRAY[(SELECT v FROM ids WHERE k = 'v3'), (SELECT v FROM ids WHERE k = 'v1'), (SELECT v FROM ids WHERE k = 'v2')]
);
RESET ROLE;

DO $$
BEGIN
  IF pg_temp.desired() <> (SELECT n FROM probe WHERE k = 'before') THEN
    RAISE EXCEPTION 'unchanged order should not bump';
  END IF;
END $$;

-- 3. Une liste incomplète (un autre onglet a changé la playlist) est refusée.
SELECT pg_temp.act_as('editor');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.reorder_playlist_videos(
      (SELECT v FROM ids WHERE k = 'pa'),
      ARRAY[(SELECT v FROM ids WHERE k = 'v1'), (SELECT v FROM ids WHERE k = 'v2')]
    );
    RAISE EXCEPTION 'incomplete list should have been refused';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'La playlist a été modifiée%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

-- 4. Sans rôle de gestion, refus explicite plutôt qu'une mise à jour silencieusement vide.
SELECT pg_temp.act_as('stranger');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.reorder_playlists(ARRAY[(SELECT v FROM ids WHERE k = 'pb'), (SELECT v FROM ids WHERE k = 'pa')]);
    RAISE EXCEPTION 'stranger should have been refused';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
RESET ROLE;

-- 5. Réordonner les playlists : appliqué, une seule incrémentation.
SELECT pg_temp.act_as('editor');
SET LOCAL ROLE authenticated;
SELECT public.reorder_playlists(
  (SELECT v FROM ids WHERE k = 'pb')
    || ARRAY(SELECT id FROM public.playlists WHERE id <> (SELECT v FROM ids WHERE k = 'pb') ORDER BY position)
);
RESET ROLE;

DO $$
DECLARE
  before bigint := (SELECT n FROM probe WHERE k = 'before');
  first_id uuid;
BEGIN
  SELECT id INTO first_id FROM public.playlists ORDER BY position LIMIT 1;
  IF first_id <> (SELECT v FROM ids WHERE k = 'pb') THEN
    RAISE EXCEPTION 'playlist reorder not applied';
  END IF;
  IF pg_temp.desired() <> before + 1 THEN
    RAISE EXCEPTION 'playlist reorder should bump once: before=% after=%', before, pg_temp.desired();
  END IF;
  UPDATE probe SET n = pg_temp.desired() WHERE k = 'before';
END $$;

-- 6. Renommer prévient le casque ; changer la description non.
DO $$
DECLARE
  before bigint := (SELECT n FROM probe WHERE k = 'before');
BEGIN
  UPDATE public.playlists SET description = 'notes internes' WHERE id = (SELECT v FROM ids WHERE k = 'pa');
  IF pg_temp.desired() <> before THEN
    RAISE EXCEPTION 'description change should not bump';
  END IF;

  UPDATE public.playlists SET name = 'Voyage 2 - Paris (été)' WHERE id = (SELECT v FROM ids WHERE k = 'pa');
  IF pg_temp.desired() <> before + 1 THEN
    RAISE EXCEPTION 'rename should bump once';
  END IF;
  before := before + 1;

  -- Le diagnostic de la page Synchronisation repose sur une mise à jour neutre.
  UPDATE public.playlist_videos SET position = position WHERE playlist_id = (SELECT v FROM ids WHERE k = 'pa');
  IF pg_temp.desired() <> before + 1 THEN
    RAISE EXCEPTION 'neutral update should still bump once (diagnostic)';
  END IF;
  before := before + 1;

  -- Ajouter une vidéo reste un incrément par ligne, comme avant.
  DELETE FROM public.playlist_videos
   WHERE playlist_id = (SELECT v FROM ids WHERE k = 'pa') AND video_id = (SELECT v FROM ids WHERE k = 'v2');
  IF pg_temp.desired() <> before + 1 THEN
    RAISE EXCEPTION 'delete should still bump';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'playlist_videos_invalidate' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'playlist_videos_invalidate must keep its name (diagnostic checks it)';
  END IF;
END $$;

ROLLBACK;
