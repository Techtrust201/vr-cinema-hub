-- Ensure the Storage bucket referenced by existing storage.objects policies exists.
-- Additive / idempotent — safe on empty and existing databases.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  false,
  21474836480, -- 20 GiB soft ceiling for large VR assets
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-m4v']::text[]
)
ON CONFLICT (id) DO NOTHING;
