-- Titre d'une vidéo, tel que le casque l'affiche, choisi depuis le tableau de bord.
--
-- `name` reste le nom du fichier envoyé : l'import de dossier s'en sert pour reconnaître un
-- film déjà en bibliothèque, et le renommer ferait renvoyer le même film au prochain dépôt.
-- `title` le remplace à l'affichage quand il est renseigné ; absent, le casque garde le nom
-- de fichier, comme avant.

ALTER TABLE public.videos
  ADD COLUMN title text
  CONSTRAINT videos_title_not_blank CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 200);

COMMENT ON COLUMN public.videos.title IS
  'Titre affiché dans le casque et le tableau de bord. NULL : le nom du fichier (name) est affiché.';

-- Changer le titre change ce que montre le casque : le manifeste des casques concernés doit
-- être réémis. Reprend la définition en place en y ajoutant `title`.
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
       AND NEW.yaw_offset_deg IS NOT DISTINCT FROM OLD.yaw_offset_deg
       AND NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.title IS NOT DISTINCT FROM OLD.title
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

REVOKE EXECUTE ON FUNCTION public.trg_videos_invalidate() FROM PUBLIC, authenticated, anon;
