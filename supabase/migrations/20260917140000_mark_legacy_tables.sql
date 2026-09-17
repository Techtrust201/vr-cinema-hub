-- Marque les tables restées d'une architecture antérieure.
--
-- `agents`, `devices` et `sync_jobs` datent d'avant le passage aux casques autonomes et
-- au manifeste versionné. Plus aucun code ne les lit ni ne les écrit : ni le tableau de
-- bord, ni les fonctions de bord, ni l'application du casque. Elles restent en place
-- parce que les supprimer sans certitude absolue serait irréversible, mais rien ne doit
-- s'appuyer dessus.
--
-- Le commentaire est visible dans la console Supabase : quelqu'un qui explore le schéma
-- comprend immédiatement qu'il ne faut pas repartir de ces tables.

COMMENT ON TABLE public.agents IS
  'HORS SERVICE — architecture antérieure aux casques autonomes. Aucun code ne l''utilise. '
  'Ne rien construire dessus : voir headsets et manifest_versions.';

COMMENT ON TABLE public.devices IS
  'HORS SERVICE — remplacée par headsets. Aucun code ne l''utilise.';

COMMENT ON TABLE public.sync_jobs IS
  'HORS SERVICE — remplacée par le manifeste versionné (manifest_versions, sync_reports). '
  'Aucun code ne l''utilise.';
