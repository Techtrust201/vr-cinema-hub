-- Add projection + stereo_mode to videos, keep legacy format
CREATE TYPE public.video_projection AS ENUM ('360', '180', 'flat');
CREATE TYPE public.video_stereo_mode AS ENUM ('mono', 'top_bottom', 'side_by_side', 'unknown');

ALTER TABLE public.videos
  ADD COLUMN projection public.video_projection,
  ADD COLUMN stereo_mode public.video_stereo_mode;

-- Backfill from legacy format
UPDATE public.videos SET
  projection = CASE
    WHEN format IN ('360_mono', '360_stereo') THEN '360'::public.video_projection
    WHEN format IN ('180_mono', '180_stereo') THEN '180'::public.video_projection
    WHEN format = 'flat' THEN 'flat'::public.video_projection
  END,
  stereo_mode = CASE
    WHEN format IN ('360_mono', '180_mono', 'flat') THEN 'mono'::public.video_stereo_mode
    WHEN format IN ('360_stereo', '180_stereo') THEN 'unknown'::public.video_stereo_mode
  END;

ALTER TABLE public.videos
  ALTER COLUMN projection SET NOT NULL,
  ALTER COLUMN stereo_mode SET NOT NULL,
  ALTER COLUMN projection SET DEFAULT '360'::public.video_projection,
  ALTER COLUMN stereo_mode SET DEFAULT 'mono'::public.video_stereo_mode;

-- Consistency: flat must be mono
ALTER TABLE public.videos
  ADD CONSTRAINT videos_flat_must_be_mono
  CHECK (projection <> 'flat' OR stereo_mode = 'mono');