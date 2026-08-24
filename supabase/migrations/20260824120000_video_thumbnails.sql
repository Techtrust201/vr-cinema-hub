-- Miniatures de vidéos.
--
-- La colonne videos.thumbnail_url existait depuis la création de la table mais n'a jamais été
-- alimentée. Elle stocke désormais un CHEMIN dans le bucket privé `thumbnails` (même convention
-- que videos.storage_path), et non une URL : une URL signée expire, alors qu'un chemin reste
-- valable et se signe à la demande, côté dashboard comme côté casque.
--
-- Le bucket est privé pour la même raison que `videos` : le contenu appartient au client et ne
-- doit pas être accessible sans autorisation.

-- ---------------------------------------------------------------- Bucket

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'thumbnails',
  'thumbnails',
  false,
  5242880, -- 5 MiB : une miniature dépassant cette taille traduit une erreur de génération
  ARRAY['image/jpeg', 'image/webp', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------- Policies

-- Lecture pour tout utilisateur authentifié : les miniatures s'affichent dans le dashboard.
DROP POLICY IF EXISTS "Authenticated read thumbnails" ON storage.objects;
CREATE POLICY "Authenticated read thumbnails"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'thumbnails');

-- Écriture réservée aux mêmes rôles que les vidéos : la miniature est produite pendant l'envoi
-- de la vidéo, par la même personne.
DROP POLICY IF EXISTS "Content managers upload thumbnails" ON storage.objects;
CREATE POLICY "Content managers upload thumbnails"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'thumbnails' AND public.can_manage_content(auth.uid()));

DROP POLICY IF EXISTS "Content managers update thumbnails" ON storage.objects;
CREATE POLICY "Content managers update thumbnails"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'thumbnails' AND public.can_manage_content(auth.uid()));

DROP POLICY IF EXISTS "Content managers delete thumbnails" ON storage.objects;
CREATE POLICY "Content managers delete thumbnails"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'thumbnails' AND public.can_manage_content(auth.uid()));

-- ---------------------------------------------------------------- Invalidation du manifeste

-- Le trigger d'invalidation ignorait thumbnail_url : une miniature ajoutée après l'envoi de la
-- vidéo n'était donc jamais transmise aux casques déjà synchronisés. Comme la miniature est
-- produite juste après l'insertion de la vidéo, ce cas est la règle et non l'exception.
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

REVOKE ALL ON FUNCTION public.trg_videos_invalidate() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.videos.thumbnail_url IS
  'Chemin de la miniature dans le bucket privé thumbnails (et non une URL). Signé à la demande.';
