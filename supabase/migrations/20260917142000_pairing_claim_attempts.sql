-- Journal des tentatives d'appairage, pour en limiter le nombre.
--
-- Le code d'appairage compte six chiffres et vit dix minutes. Réclamer un code exige
-- déjà un compte autorisé à gérer les casques, donc aucun anonyme ne peut le deviner.
-- Reste le cas d'un compte détourné : sans limite, un script pouvait essayer le million
-- de combinaisons et s'emparer d'un appairage en préparation.
--
-- Seul le serveur écrit et lit cette table : les fonctions de bord utilisent la clé de
-- service. Aucun accès n'est donné aux comptes connectés, qui n'ont rien à y faire.

CREATE TABLE IF NOT EXISTS public.pairing_claim_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Les recherches portent toujours sur « les échecs récents de ce compte ».
CREATE INDEX IF NOT EXISTS pairing_claim_attempts_actor_time_idx
  ON public.pairing_claim_attempts (actor_user_id, created_at DESC)
  WHERE succeeded = false;

ALTER TABLE public.pairing_claim_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pairing_claim_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.pairing_claim_attempts TO service_role;

COMMENT ON TABLE public.pairing_claim_attempts IS
  'Tentatives de réclamation d''un code d''appairage, pour limiter le balayage. '
  'Écrite et lue uniquement par les fonctions de bord via la clé de service.';

-- Compte les échecs récents d'un compte et purge au passage les traces trop vieilles,
-- pour que la table ne grossisse pas indéfiniment sans tâche planifiée.
CREATE OR REPLACE FUNCTION public.recent_failed_pairing_claims(
  _actor_user_id uuid,
  _window_minutes integer DEFAULT 15
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.pairing_claim_attempts
  WHERE created_at < now() - interval '24 hours';

  SELECT count(*)
  INTO v_count
  FROM public.pairing_claim_attempts
  WHERE actor_user_id = _actor_user_id
    AND succeeded = false
    AND created_at > now() - make_interval(mins => _window_minutes);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recent_failed_pairing_claims(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recent_failed_pairing_claims(uuid, integer) TO service_role;
