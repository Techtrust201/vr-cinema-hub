-- Retire de l'API publique la fonction du déclencheur de révocation.
--
-- Une fonction déclarée SECURITY DEFINER dans le schéma `public` devient appelable via
-- /rest/v1/rpc/ tant que l'exécution n'a pas été révoquée. `bump_token_version_on_revoke`
-- est une fonction de déclencheur : appelée directement, elle échouerait faute de
-- contexte, mais exposer une fonction privilégiée sans raison reste une surface inutile.
-- La migration précédente l'avait créée sans cette révocation.

REVOKE ALL ON FUNCTION public.bump_token_version_on_revoke() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.bump_token_version_on_revoke() IS
  'Déclencheur sur headsets : périme le jeton du casque lors de sa révocation. '
  'Jamais appelée directement.';

-- `pairing_claim_attempts` n'a volontairement aucune politique : sécurité au niveau des
-- lignes active sans politique refuse tout le monde, et seules les fonctions de bord y
-- accèdent avec la clé de service, qui n'y est pas soumise. Le contrôle automatique
-- signale cette absence de politique ; c'est bien le comportement recherché.
COMMENT ON TABLE public.pairing_claim_attempts IS
  'Tentatives de réclamation d''un code d''appairage, pour limiter le balayage. '
  'Sécurité des lignes active sans aucune politique : refus total par défaut, seule la '
  'clé de service y accède depuis les fonctions de bord.';
