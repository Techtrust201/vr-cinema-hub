-- Versions publiées de l'application casque, pour la télécharger depuis le site.
--
-- L'APK est construit sur le poste de développement puis envoyé sur R2 par
-- scripts/release-headset-app.sh. Une ligne n'est insérée qu'une fois le fichier en place :
-- la plus récente est donc toujours téléchargeable, et c'est elle que le site propose.
--
-- Les fichiers ne sont jamais écrasés, chaque version a le sien : revenir en arrière ne
-- demande que de supprimer la ligne fautive.

CREATE TABLE public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name text NOT NULL CHECK (length(version_name) BETWEEN 1 AND 32),
  -- Android refuse d'installer une mise à jour dont le numéro n'augmente pas.
  version_code integer NOT NULL UNIQUE CHECK (version_code > 0),
  storage_path text NOT NULL UNIQUE
    CHECK (storage_path ~ '^releases/[A-Za-z0-9][A-Za-z0-9._-]*\.apk$'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- Empreinte du certificat de signature : une mise à jour signée par une autre clé est
  -- refusée par le casque, et ne peut s'installer qu'en effaçant films et appairage.
  signer_sha256 text CHECK (signer_sha256 IS NULL OR signer_sha256 ~ '^[0-9a-f]{64}$'),
  git_commit text CHECK (git_commit IS NULL OR git_commit ~ '^[0-9a-f]{7,40}$'),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_releases IS
  'APK de l''application casque publiés sur R2 (releases/). La ligne la plus récente est celle '
  'que le site propose au téléchargement. Écriture réservée à la clé de service.';

CREATE INDEX app_releases_created_at_idx ON public.app_releases (created_at DESC);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_releases_content_managers_read ON public.app_releases
  FOR SELECT TO authenticated
  USING (public.can_manage_content(auth.uid()));

REVOKE ALL ON public.app_releases FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.app_releases FROM authenticated;
GRANT SELECT ON public.app_releases TO authenticated;
