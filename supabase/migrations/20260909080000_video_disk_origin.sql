-- Origine des octets : le bucket Storage, ou le disque du client derrière un tunnel.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'supabase';

ALTER TABLE public.videos
  DROP CONSTRAINT IF EXISTS videos_origin_check;

ALTER TABLE public.videos
  ADD CONSTRAINT videos_origin_check CHECK (origin IN ('supabase', 'disk'));

COMMENT ON COLUMN public.videos.origin IS
  'supabase = bucket Storage ; disk = nœud maison (Cloudflare Tunnel).';
