-- SHA-256 integrity for headset downloads (optional until backfilled).
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS sha256 TEXT;

COMMENT ON COLUMN public.videos.sha256 IS
  'Hex-encoded SHA-256 of the storage object body. Null = not yet computed; clients may skip hash check.';

CREATE INDEX IF NOT EXISTS videos_sha256_idx
  ON public.videos (sha256)
  WHERE sha256 IS NOT NULL;
