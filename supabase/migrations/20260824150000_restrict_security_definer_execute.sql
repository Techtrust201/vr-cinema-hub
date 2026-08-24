-- Retire l'accès anonyme aux fonctions SECURITY DEFINER.
--
-- Une fonction SECURITY DEFINER s'exécute avec les droits de son propriétaire et ignore donc
-- les politiques RLS. Ces cinq fonctions étaient exposées à PUBLIC, c'est-à-dire appelables
-- sur /rest/v1/rpc/... avec la seule clé publique, sans aucune session : n'importe qui
-- connaissant l'URL du projet pouvait écrire des rapports de synchronisation ou lire l'état
-- interne d'un casque.
--
-- Chaque fonction reçoit ici exactement les rôles qui l'appellent réellement.

-- ---------------------------------------------------------------------------
-- Rapports de synchronisation : appelés uniquement par la fonction Edge
-- headset-report-sync, qui utilise la clé de service. Le casque n'atteint
-- jamais ces RPC directement, il passe toujours par la fonction Edge.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.start_sync_report(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_sync_report(uuid, text, text, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_sync_report(
  uuid, uuid, public.sync_status, bigint, integer, integer, integer, bigint,
  text, jsonb, uuid, integer, integer, integer, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_sync_report(
  uuid, uuid, public.sync_status, bigint, integer, integer, integer, bigint,
  text, jsonb, uuid, integer, integer, integer, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Diagnostics : utilisés par le panneau de diagnostic du tableau de bord, donc
-- réservés aux utilisateurs connectés. Ils exposent l'état de synchronisation
-- d'un casque et l'impact d'une playlist, qui n'ont rien à faire en public.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.diagnose_headset_sync(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.diagnose_headset_sync(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.diagnose_playlist_impact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.diagnose_playlist_impact(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rls_auto_enable est la fonction d'un event trigger : elle active RLS sur
-- toute table nouvellement créée dans public. Le déclencheur l'invoque par le
-- système, sans passer par le droit EXECUTE, donc personne n'a besoin de
-- pouvoir l'appeler.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
