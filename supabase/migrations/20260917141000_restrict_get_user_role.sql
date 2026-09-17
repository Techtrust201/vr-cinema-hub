-- Empêche un utilisateur de lire le rôle d'un autre compte.
--
-- `get_user_role` s'exécute avec les droits de son propriétaire et n'effectuait aucun
-- contrôle : tout compte connecté pouvait demander le rôle de n'importe qui. C'est une
-- fuite d'information — savoir qui est propriétaire désigne la cible à attaquer — même
-- si elle ne permet aucune modification.
--
-- Trois accès restent légitimes :
--
--   * lire son propre rôle, ce que fait le tableau de bord à chaque connexion ;
--   * lire le rôle d'autrui quand on est soi-même administrateur ou propriétaire, pour
--     la page de gestion des utilisateurs ;
--   * les appels effectués côté serveur avec la clé de service, par les fonctions de
--     bord qui vérifient les droits de l'appelant avant d'agir.
--
-- Le troisième cas se reconnaît à `auth.uid()` vide : la fonction est révoquée pour le
-- rôle anonyme, donc une session sans utilisateur identifié ne peut être que la clé de
-- service. S'appuyer là-dessus évite de dépendre de la forme des jetons.
--
-- La fonction passe de SQL à PL/pgSQL pour pouvoir refuser. Elle n'est utilisée par
-- aucune politique de sécurité — seulement par le tableau de bord, quatre fonctions de
-- bord et deux fonctions internes de gestion des rôles — donc lever une exception ne
-- peut pas bloquer un accès aux données.
--
-- `can_manage_content` garde volontairement son comportement : elle est appelée par des
-- dizaines de politiques, y compris sur le stockage, et ne renvoie qu'un booléen sans
-- révéler quel rôle est en cause.

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_caller IS NOT NULL
     AND _user_id IS DISTINCT FROM v_caller
     AND NOT public.is_admin_or_owner(v_caller) THEN
    RAISE EXCEPTION 'forbidden'
      USING HINT = 'Seul un administrateur peut consulter le rôle d''un autre compte.';
  END IF;

  SELECT ur.role
  INTO v_role
  FROM public.user_roles AS ur
  WHERE ur.user_id = _user_id
  ORDER BY
    CASE ur.role
      WHEN 'owner' THEN 0
      WHEN 'admin' THEN 1
      ELSE 2
    END,
    ur.created_at ASC NULLS LAST
  LIMIT 1;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_user_role(uuid) IS
  'Rôle le plus élevé d''un compte. Accessible pour soi-même, pour un administrateur, '
  'ou depuis le serveur avec la clé de service.';
