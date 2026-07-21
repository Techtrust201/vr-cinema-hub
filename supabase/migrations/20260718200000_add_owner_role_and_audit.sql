-- Add owner enum value (must be its own migration / transaction)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
