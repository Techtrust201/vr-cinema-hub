-- Permet d'invalider le jeton d'un casque sans attendre son expiration.
--
-- Le jeton d'un casque vaut un an et n'était vérifié que sur sa signature et sa date.
-- Réappairer un casque émettait un nouveau jeton sans annuler l'ancien : un jeton copié
-- avant une revente, un prêt ou une mise au rebut gardait accès au catalogue et aux
-- liens de téléchargement des films pendant des mois.
--
-- Chaque jeton porte désormais le numéro de version en cours au moment de son émission.
-- Un appairage ou une révocation incrémente le numéro sur le casque, ce qui périme
-- d'un coup tous les jetons émis avant.
--
-- La colonne démarre à 0, et un jeton sans numéro est lu comme la version 0 : les
-- casques déjà en service continuent donc de fonctionner sans être réappairés. Ils
-- basculeront sur le mécanisme à leur prochain appairage.

ALTER TABLE public.headsets
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.headsets.token_version IS
  'Version du jeton en vigueur. Un jeton portant une version inférieure est refusé. '
  'Incrémentée à chaque appairage et à chaque révocation. Un jeton sans version vaut 0, '
  'pour les casques mis en service avant ce mécanisme.';

-- Le casque ne doit jamais pouvoir lire ni écrire cette colonne : les fonctions de bord
-- s'en chargent avec la clé de service, comme pour device_token et pairing_secret.
REVOKE ALL (token_version) ON TABLE public.headsets FROM anon, authenticated;

-- Une révocation depuis le tableau de bord doit aussi couper l'accès du jeton, sans
-- quoi un casque révoqué garderait un jeton techniquement valide.
CREATE OR REPLACE FUNCTION public.bump_token_version_on_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'revoked' AND OLD.status IS DISTINCT FROM 'revoked' THEN
    NEW.token_version := COALESCE(OLD.token_version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_headsets_bump_token_on_revoke ON public.headsets;
CREATE TRIGGER trg_headsets_bump_token_on_revoke
  BEFORE UPDATE OF status ON public.headsets
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_token_version_on_revoke();
