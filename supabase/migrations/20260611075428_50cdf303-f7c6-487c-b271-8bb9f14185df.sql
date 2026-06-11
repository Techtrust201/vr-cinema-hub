
ALTER TABLE public.pairing_codes
  ADD COLUMN pairing_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN device_token TEXT;
ALTER TABLE public.pairing_codes ALTER COLUMN pairing_secret DROP DEFAULT;
