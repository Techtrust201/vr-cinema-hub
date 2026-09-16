-- Troisième origine possible pour les octets : Cloudflare R2.
--
-- Le nœud maison ('disk') dépend d'une machine allumée chez l'exploitant : il
-- reste supporté pour ne pas casser les vidéos déjà en place, mais R2 devient la
-- cible pour une flotte de casques répartis sur plusieurs sites.
ALTER TABLE public.videos
  DROP CONSTRAINT IF EXISTS videos_origin_check;

ALTER TABLE public.videos
  ADD CONSTRAINT videos_origin_check CHECK (origin IN ('supabase', 'disk', 'r2'));

COMMENT ON COLUMN public.videos.origin IS
  'supabase = bucket Storage ; disk = nœud maison (Cloudflare Tunnel) ; r2 = Cloudflare R2.';
