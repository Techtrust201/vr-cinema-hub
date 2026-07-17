-- pairing_secret requires pgcrypto (gen_random_bytes).
-- Explicit CREATE EXTENSION keeps empty remote projects compatible.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.pairing_codes
  ADD COLUMN pairing_secret TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  ADD COLUMN device_token TEXT;
ALTER TABLE public.pairing_codes ALTER COLUMN pairing_secret DROP DEFAULT;
