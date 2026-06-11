## Objectif

Faire en sorte que la page "Suivi des synchronisations" reflète la **réalité du casque**, pas la réalité du dashboard. Le vert n'apparaît plus quand on clique côté web — uniquement quand le casque Quest confirme avoir appliqué une version donnée.

## Modèle de données (migration)

### 1. Versionner le manifest par casque

Nouvelle colonne sur `headsets` :
- `desired_manifest_version BIGINT NOT NULL DEFAULT 0` — incrémentée par le serveur dès qu'une mutation impacte ce casque.
- `applied_manifest_version BIGINT NOT NULL DEFAULT 0` — mise à jour uniquement par le report du casque.
- `last_manifest_at TIMESTAMPTZ` — dernier appel à `headset-manifest`.

Le casque est `up_to_date` quand `applied = desired`, sinon `pending` (ou `stale` si pas de heartbeat depuis X minutes).

### 2. Historique des versions

Nouvelle table `manifest_versions` (snapshot immuable du manifest émis) :
- `headset_id`, `version` (BIGINT), `playlist_id`, `payload JSONB` (le manifest tel qu'envoyé), `cause TEXT` (ex: `playlist_video_added`), `created_at`.
- PK composite `(headset_id, version)`.
- Permet d'auditer "qu'a vraiment vu le casque" et de diagnostiquer les régressions.

### 3. Enrichir `sync_reports`

Ajout de colonnes :
- `applied_manifest_version BIGINT` — version réellement appliquée.
- `playlist_id UUID NULL` — playlist effective au moment du report.
- `remote_video_count INT`, `local_video_count INT`, `visible_video_count INT`.
- Extension du type enum `sync_status` avec `no_change` et `pending`.

### 4. Fonction SQL `bump_headset_versions(headset_ids uuid[], cause text)`

`SECURITY DEFINER`. Incrémente `desired_manifest_version` pour chaque casque ciblé, log la cause. Réutilisée par toutes les mutations.

### 5. Triggers d'invalidation côté DB

Triggers AFTER INSERT/UPDATE/DELETE sur :
- `playlist_videos` → casques abonnés à la playlist (via `assignments` + `headset_group_members`).
- `assignments` → casques de la cible (`all` / `group` / `headset`).
- `headset_group_members` → casque concerné.
- `videos` (UPDATE de `storage_path`, `projection`, `stereo_mode`, `name`) → tous les casques abonnés via une playlist contenant la vidéo.
- `playlists` (UPDATE name) → idem.

Chaque trigger calcule l'ensemble des `headset_id` impactés et appelle `bump_headset_versions(...)`. Source de vérité unique : impossible d'oublier d'incrémenter depuis le front.

## Edge functions

### `headset-manifest` (réécriture v3)

- Calcule la playlist effective (logique actuelle conservée).
- Lit `desired_manifest_version` du casque.
- Construit le payload (videos[] avec `id`, `name`, `download_url`, `projection`, `stereo_mode`, `file_extension`, `size_bytes`, `duration_seconds`, `position`, `updated_at`).
- Insère/upsert dans `manifest_versions` si la version n'existe pas encore.
- Réponse :
  ```json
  {
    "manifest_version": 42,
    "headset_id": "...",
    "playlist_id": "...",
    "updated_at": "...",
    "url_expires_in": 900,
    "videos": [ ... ]
  }
  ```
- Supporte `If-None-Match: <version>` (header ou query `?known_version=`) → renvoie `304` si rien n'a changé, ce qui évite de re-signer les URLs.
- Met à jour `last_manifest_at`.
- Logs structurés : `headset_id`, `groups`, `playlists`, `playlist_video_rows`, `final_videos`, `desired_version`, `served_version`.

### `headset-report-sync` (extension)

- Accepte les nouveaux champs : `applied_manifest_version`, `playlist_id`, `remote_video_count`, `local_video_count`, `visible_video_count`, `status` (`success`, `partial`, `failed`, `no_change`).
- Si `status in ('success','no_change')` ET `applied_manifest_version >= headsets.applied_manifest_version` → met à jour `headsets.applied_manifest_version`.
- Sinon laisse tel quel (l'écart `desired - applied` reste visible).
- Ne marque JAMAIS un report `success` sans `applied_manifest_version`.

### `headset-heartbeat` (extension légère)

Ajoute dans la réponse `{ desired_manifest_version, applied_manifest_version }` pour que le casque sache s'il doit relancer une sync immédiatement (sans attendre son cycle).

## Dashboard

### Page "Suivi des synchronisations" (`src/pages/Sync.tsx`)

Nouvelle structure en 2 onglets :

**1. État par casque** (vue par défaut)
Liste tous les casques avec :
- nom
- `desired_version` / `applied_version`
- badge : `À jour` (vert), `En attente` (orange, applied<desired), `Hors-ligne` (gris, pas de heartbeat >10 min), `Erreur` (rouge, dernier report failed)
- date du dernier manifest servi, date du dernier report
- bouton "Forcer resync" → incrémente `desired_manifest_version` côté serveur (cause `manual_force`).

**2. Historique des reports**
La liste actuelle, enrichie : version appliquée, playlist, compteurs vidéos (remote/local/visible).

Realtime via Supabase Realtime sur `headsets` ET `sync_reports`. Le client n'invente plus aucun statut : tout vient des colonnes serveur.

### Page "Headsets"
Ajout d'une colonne badge sync (mêmes états que ci-dessus).

## Points hors scope (Unity)

Le code Unity doit envoyer `applied_manifest_version` dans `headset-report-sync` et lire `manifest_version` dans la réponse. Documenté dans `docs/API.md` mais non implémenté dans ce repo (Unity vit ailleurs).

## Validation (suivre `scripts/test-headset-flow.sh` étendu)

1. Ajout d'une vidéo à une playlist diffusée à un casque → un trigger bump `desired_manifest_version` → page Sync passe en `En attente` immédiatement.
2. Appel manuel `headset-manifest` avec le token → renvoie `manifest_version` incrémentée + la nouvelle vidéo.
3. `headset-report-sync` avec `applied_manifest_version` égale → `applied_manifest_version` mis à jour côté DB → page passe en `À jour`.
4. Sans report : la page reste `En attente` indéfiniment (jamais de faux vert).
5. Suppression d'une vidéo de playlist → re-bump → re-cycle.

## Étapes d'implémentation

1. Migration : colonnes `desired/applied_manifest_version` + `last_manifest_at` sur `headsets`, table `manifest_versions`, colonnes `sync_reports`, enum étendu, fonction `bump_headset_versions`, triggers d'invalidation, GRANTs.
2. Réécrire `headset-manifest` (v3) avec versioning + snapshot.
3. Étendre `headset-report-sync` pour appliquer la version.
4. Étendre `headset-heartbeat` (réponse enrichie).
5. Refondre `src/pages/Sync.tsx` (onglets, état par casque, realtime sur `headsets`).
6. Ajouter badge sync dans `src/pages/Headsets.tsx`.
7. Bouton "Forcer resync" (mini edge function `headset-force-resync` qui appelle `bump_headset_versions`, protégée par auth admin).
8. Mettre à jour `docs/API.md` et `scripts/test-headset-flow.sh`.

Aucune modification de logique métier des playlists/groupes : les triggers DB rendent l'invalidation automatique, donc le front existant n'a rien à changer pour rester correct.
