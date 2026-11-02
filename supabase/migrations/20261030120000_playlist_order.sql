-- Ordre des playlists et des vidéos, tel que le casque doit les présenter.
--
-- Le casque affiche chaque playlist comme un dossier, dans l'ordre choisi sur le tableau de
-- bord, et enchaîne les vidéos d'un dossier dans l'ordre de `playlist_videos.position`.
-- L'ordre n'a donc qu'une source : ces deux colonnes. Le tri alphabétique n'est qu'une
-- façon de les réécrire, depuis le tableau de bord.

-- 1. Position des playlists ---------------------------------------------------------------

-- Tri « naturel » : « Voyage 2 » avant « Voyage 10 », que le tri binaire inverse.
CREATE COLLATION IF NOT EXISTS public.fr_natural (provider = icu, locale = 'fr-u-kn-true');

ALTER TABLE public.playlists ADD COLUMN position integer NOT NULL DEFAULT 0;

UPDATE public.playlists p
   SET position = o.rn
  FROM (
    SELECT id, row_number() OVER (ORDER BY name COLLATE public.fr_natural, created_at, id) AS rn
      FROM public.playlists
  ) o
 WHERE o.id = p.id;

-- Une playlist créée sans position se range après les autres. Deux créations simultanées
-- peuvent obtenir la même position : le manifeste départage alors par le nom.
CREATE OR REPLACE FUNCTION public.next_playlist_position()
RETURNS integer
LANGUAGE sql
VOLATILE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(MAX(position), 0) + 1 FROM public.playlists
$$;

ALTER TABLE public.playlists ALTER COLUMN position SET DEFAULT public.next_playlist_position();

COMMENT ON COLUMN public.playlists.position IS
  'Rang du dossier dans la bibliothèque du casque (croissant). Réécrit par reorder_playlists.';

-- 2. Renommer ou réordonner une playlist change ce qu'affiche le casque --------------------

-- Déclencheur par instruction : réordonner dix playlists n'incrémente la version des
-- casques qu'une fois. La description n'est pas montrée dans le casque et n'incrémente rien.
CREATE OR REPLACE FUNCTION public.trg_playlists_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT hp.headset_id) INTO _ids
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    CROSS JOIN LATERAL public.headsets_for_playlist(n.id) hp
   WHERE n.name IS DISTINCT FROM o.name
      OR n.position IS DISTINCT FROM o.position;

  PERFORM public.bump_headset_versions(_ids, 'playlist_UPDATE');
  RETURN NULL;
END;
$function$;

CREATE TRIGGER playlists_invalidate
  AFTER UPDATE ON public.playlists
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_playlists_invalidate();

-- 3. Réordonner les vidéos d'une playlist n'incrémente la version qu'une fois --------------

-- Le déclencheur par ligne incrémentait la version à chaque vidéo déplacée : vingt
-- incréments pour un seul glisser-déposer. Les mises à jour passent à un déclencheur par
-- instruction ; ajouts et retraits restent par ligne. Le nom `playlist_videos_invalidate`
-- est conservé : la fonction de diagnostic vérifie sa présence.
DROP TRIGGER IF EXISTS playlist_videos_invalidate ON public.playlist_videos;
CREATE TRIGGER playlist_videos_invalidate
  AFTER INSERT OR DELETE ON public.playlist_videos
  FOR EACH ROW EXECUTE FUNCTION public.trg_playlist_videos_invalidate();

-- Toute mise à jour incrémente, même sans changement de valeur : le diagnostic de la page
-- Synchronisation s'appuie sur une mise à jour neutre pour vérifier la chaîne d'incrément.
-- C'est la RPC de réordonnancement qui évite d'écrire les lignes inchangées.
CREATE OR REPLACE FUNCTION public.trg_playlist_videos_update_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT hp.headset_id) INTO _ids
    FROM (SELECT playlist_id FROM old_rows UNION SELECT playlist_id FROM new_rows) p
    CROSS JOIN LATERAL public.headsets_for_playlist(p.playlist_id) hp;

  PERFORM public.bump_headset_versions(_ids, 'playlist_videos_UPDATE');
  RETURN NULL;
END;
$function$;

CREATE TRIGGER playlist_videos_invalidate_update
  AFTER UPDATE ON public.playlist_videos
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_playlist_videos_update_invalidate();

REVOKE ALL ON FUNCTION public.trg_playlists_invalidate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_playlist_videos_update_invalidate() FROM PUBLIC, anon, authenticated;

-- 4. Réordonnancement en une écriture -------------------------------------------------------

-- La liste reçue doit correspondre exactement au contenu actuel. Sinon, un second onglet a
-- ajouté ou retiré une vidéo entre-temps, et appliquer l'ordre reçu ferait disparaître ou
-- placerait au hasard ce que l'autre onglet a changé.
CREATE OR REPLACE FUNCTION public.reorder_playlist_videos(_playlist_id uuid, _video_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _current uuid[];
  _wanted uuid[];
BEGIN
  IF NOT public.can_manage_content(auth.uid()) THEN
    RAISE EXCEPTION 'Droits insuffisants pour modifier l''ordre de lecture.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.playlists WHERE id = _playlist_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playlist introuvable.' USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(video_id ORDER BY video_id) INTO _current
    FROM public.playlist_videos WHERE playlist_id = _playlist_id;
  SELECT array_agg(x ORDER BY x) INTO _wanted FROM unnest(_video_ids) x;

  IF _current IS DISTINCT FROM _wanted THEN
    RAISE EXCEPTION 'La playlist a été modifiée entre-temps. Rechargez la page puis recommencez.'
      USING ERRCODE = 'P0001', HINT = 'playlist_changed';
  END IF;

  UPDATE public.playlist_videos pv
     SET position = o.ord::integer
    FROM unnest(_video_ids) WITH ORDINALITY AS o(video_id, ord)
   WHERE pv.playlist_id = _playlist_id
     AND pv.video_id = o.video_id
     AND pv.position IS DISTINCT FROM o.ord::integer;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_playlists(_playlist_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _current uuid[];
  _wanted uuid[];
BEGIN
  IF NOT public.can_manage_content(auth.uid()) THEN
    RAISE EXCEPTION 'Droits insuffisants pour modifier l''ordre des playlists.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.playlists FOR UPDATE;

  SELECT array_agg(id ORDER BY id) INTO _current FROM public.playlists;
  SELECT array_agg(x ORDER BY x) INTO _wanted FROM unnest(_playlist_ids) x;

  IF _current IS DISTINCT FROM _wanted THEN
    RAISE EXCEPTION 'Les playlists ont été modifiées entre-temps. Rechargez la page puis recommencez.'
      USING ERRCODE = 'P0001', HINT = 'playlist_changed';
  END IF;

  UPDATE public.playlists p
     SET position = o.ord::integer
    FROM unnest(_playlist_ids) WITH ORDINALITY AS o(id, ord)
   WHERE p.id = o.id
     AND p.position IS DISTINCT FROM o.ord::integer;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_playlist_videos(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_playlists(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_playlist_videos(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_playlists(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.reorder_playlist_videos(uuid, uuid[]) IS
  'Réécrit l''ordre de lecture d''une playlist. Refuse une liste qui ne correspond pas au '
  'contenu actuel (HINT playlist_changed).';
COMMENT ON FUNCTION public.reorder_playlists(uuid[]) IS
  'Réécrit l''ordre des dossiers du casque. Refuse une liste qui ne correspond pas aux '
  'playlists existantes (HINT playlist_changed).';
