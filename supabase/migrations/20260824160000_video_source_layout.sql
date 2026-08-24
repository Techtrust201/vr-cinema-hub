-- Encodage de la source vidéo : la façon dont ses pixels recouvrent la sphère.
--
-- Aplatir une sphère en rectangle admet plusieurs solutions, comme dessiner une mappemonde.
-- Jusqu'ici l'application supposait toujours l'équirectangulaire (la mappemonde étirée aux
-- pôles). YouTube emploie un autre encodage, six faces de cube en grille 3x2 à densité de
-- pixels uniforme, que les fichiers ne déclarent dans aucune métadonnée : il doit donc être
-- porté par la base.
--
-- Cet attribut est indépendant de `projection` (la géométrie : plat, 180, 360) et de
-- `stereo_mode` (l'empilement des deux points de vue), à l'image de la séparation déjà en
-- place entre ces deux colonnes.

CREATE TYPE public.video_source_layout AS ENUM ('equirectangular', 'equiangular_cubemap');

-- La valeur par défaut préserve exactement le comportement actuel pour les vidéos existantes :
-- toutes étaient de fait équirectangulaires, seul encodage lisible auparavant.
ALTER TABLE public.videos
  ADD COLUMN source_layout public.video_source_layout NOT NULL DEFAULT 'equirectangular';

COMMENT ON COLUMN public.videos.source_layout IS
  'Encodage de la source : equirectangular (mappemonde) ou equiangular_cubemap (grille 3x2 de '
  'faces de cube, encodage YouTube, proposé par Skybox sous l''appellation « Youtube »).';

-- Un changement d'encodage modifie la façon de lire la vidéo : le manifeste des casques
-- concernés doit être réémis, faute de quoi ils continueraient de la lire de travers.
CREATE OR REPLACE FUNCTION public.trg_videos_invalidate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ids uuid[];
  _vid uuid := COALESCE(NEW.id, OLD.id);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path
       AND NEW.projection IS NOT DISTINCT FROM OLD.projection
       AND NEW.stereo_mode IS NOT DISTINCT FROM OLD.stereo_mode
       AND NEW.source_layout IS NOT DISTINCT FROM OLD.source_layout
       AND NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.format IS NOT DISTINCT FROM OLD.format
       AND NEW.size_bytes IS NOT DISTINCT FROM OLD.size_bytes
       AND NEW.duration_seconds IS NOT DISTINCT FROM OLD.duration_seconds
       AND NEW.thumbnail_url IS NOT DISTINCT FROM OLD.thumbnail_url THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT array_agg(DISTINCT hp.headset_id) INTO _ids
    FROM public.playlist_videos pv
    CROSS JOIN LATERAL public.headsets_for_playlist(pv.playlist_id) hp
    WHERE pv.video_id = _vid;

  PERFORM public.bump_headset_versions(_ids, 'video_' || TG_OP);
  RETURN COALESCE(NEW, OLD);
END;
$function$;
