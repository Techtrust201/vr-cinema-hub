-- Prevent duplicate headsets for the same physical device serial.
-- Retire stale duplicates (same serial) before enforcing uniqueness.

-- 1) Prefer the most recently seen active row; revoke older duplicates and clear serial.
WITH ranked AS (
  SELECT
    id,
    serial,
    ROW_NUMBER() OVER (
      PARTITION BY serial
      ORDER BY
        CASE status WHEN 'active' THEN 0 ELSE 1 END,
        COALESCE(last_seen_at, 'epoch'::timestamptz) DESC,
        created_at DESC
    ) AS rn
  FROM public.headsets
  WHERE serial IS NOT NULL AND btrim(serial) <> ''
)
UPDATE public.headsets h
SET
  status = 'revoked',
  serial = NULL,
  name = CASE
    WHEN h.name LIKE '%(retired)%' THEN h.name
    ELSE h.name || ' (retired)'
  END
FROM ranked r
WHERE h.id = r.id
  AND r.rn > 1;

-- 2) Canonical rename for the active Quest5 DLPA row if still present under that name
UPDATE public.headsets
SET name = 'ALEXANDRE-CANNES-QUEST-05'
WHERE id = 'b85a94a7-5584-4286-8657-658453fe602a'
  AND name IS DISTINCT FROM 'ALEXANDRE-CANNES-QUEST-05';

-- 3) Unique serial among non-null values
CREATE UNIQUE INDEX IF NOT EXISTS headsets_serial_unique_idx
  ON public.headsets (serial)
  WHERE serial IS NOT NULL AND btrim(serial) <> '';
