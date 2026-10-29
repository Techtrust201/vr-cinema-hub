-- Orientation d'un film 180/360 : où se trouve, dans l'image, ce qui doit apparaître face
-- au spectateur au lancement.
--
-- Le casque place le centre de l'image devant le spectateur. Certains tournages ne mettent pas
-- le sujet au centre : la caméra était posée de travers, ou l'action se passe sur le côté.
-- Sans ce réglage, il faudrait réexporter le film pour le recadrer.
--
-- Exprimé en degrés depuis le centre de l'image, positif vers la droite : 90 signifie que le
-- sujet est aux trois quarts de la largeur, et le casque fera pivoter la sphère pour l'amener
-- devant. Sans effet sur un film projeté sur écran plat.

ALTER TABLE public.videos
  ADD COLUMN yaw_offset_deg real NOT NULL DEFAULT 0
  CONSTRAINT videos_yaw_offset_deg_range CHECK (yaw_offset_deg > -180 AND yaw_offset_deg <= 180);

COMMENT ON COLUMN public.videos.yaw_offset_deg IS
  'Position horizontale du sujet dans l''image, en degrés depuis le centre (positif vers la '
  'droite). Le casque fait pivoter la sphère 180/360 pour l''amener face au spectateur.';

-- Changer l'orientation change la façon de présenter le film : le manifeste des casques
-- concernés doit être réémis, faute de quoi ils garderaient l'ancienne orientation.
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
