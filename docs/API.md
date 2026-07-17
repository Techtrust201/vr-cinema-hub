# API Casques (OTA) — Documentation

Base URL : `https://eanocqzhvlpgppccfppi.supabase.co/functions/v1`

Tous les endpoints attendent `Content-Type: application/json` et l'en-tête `apikey: <VITE_SUPABASE_PUBLISHABLE_KEY>` (clé publiable, OK en clair dans l'app Unity).

## Vue d'ensemble

```
 1er boot du casque :
    headset-pair-init  ──►  affiche code 6 chiffres + garde pairing_secret
    headset-pair-poll  ──►  toutes les 3 s tant que status != "claimed"
                            (admin valide le code dans le dashboard)
                       ◄──  device_token (JWT 1 an) → stocker localement

 Boucle normale (toutes les 5 min) :
    headset-manifest      ──►  liste des vidéos + URLs signées 15 min
    [téléchargement HTTP des fichiers manquants]
    headset-report-sync (started) ──►  report_id
    [download…]
    headset-report-sync (finished) ──►  ok
    headset-heartbeat   ──►  ping batterie / stockage
```

Tous les endpoints d'exécution (manifest/heartbeat/report) demandent l'en-tête `Authorization: Bearer <device_token>`.

---

## 1. `POST /headset-pair-init`
Demande un code d'appairage. **Public** (pas de Bearer).

Body :
```json
{ "serial": "1WMHHxxxxxxxxx", "model": "Quest 3" }
```
Réponse 200 :
```json
{ "code": "428193", "pairing_secret": "abc123…", "expires_at": "2026-06-11T12:34:56Z" }
```
Le casque doit afficher `code` à l'utilisateur et garder `pairing_secret` en RAM (jamais affiché).

## 2. `POST /headset-pair-poll`
Polling toutes les 3 s. **Public**.

Body : `{ "code": "428193", "pairing_secret": "abc123…" }`

Réponses :
- `{ "status": "pending" }` → continuer à poller
- `{ "status": "expired" }` → recommencer à l'étape 1
- `{ "status": "claimed", "headset_id": "...", "device_token": "eyJ..." }` → **stocker `device_token` sur le casque** (`PlayerPrefs`, fichier chiffré, etc.) et arrêter de poller. Token lisible **une seule fois**.

## 3. `POST /headset-pair-claim`
Appelé par le **dashboard web** (pas le casque). Doc présente pour info.

## 4. `GET|POST /headset-manifest`
**Auth : Bearer device_token**. `GET` et `POST` sont équivalents. Body ignoré.

Query params optionnels :
- `known_version=N` — la version que le casque a déjà appliquée. Si `N === desired_manifest_version` du serveur, réponse `304` (pas de re-signature des URLs).
- `force_full=1` (ou `force=1`) — ignore le 304 et renvoie toujours le manifest complet.

Header optionnel : `If-None-Match: "N"` (équivalent à `known_version`). Accepte `42`, `"42"`, `W/"42"`.

Le serveur renvoie systématiquement `ETag: "<manifest_version>"`.

Réponse **200** :
```json
{
  "manifest_version": 42,
  "schema_version": 3,
  "headset_id": "uuid",
  "playlist_id": "uuid|null",
  "generated_at": "2026-06-12T00:00:00Z",
  "updated_at": "2026-06-12T00:00:00Z",
  "url_expires_in": 900,
  "videos": [
    {
      "id": "uuid",
      "name": "Plage 360.mp4",
      "download_url": "https://…?token=…",
      "url": "https://…?token=…",
      "order": 0,
      "projection": "360" | "180" | "flat",
      "stereo_mode": "mono" | "sbs" | "tb" | null,
      "file_extension": "mp4" | "mov" | "m4v" | "webm" | "mkv",
      "size_bytes": 1234567890,
      "duration_seconds": 240,
      "updated_at": "...",
      "format": "mp4",
      "legacy_format": "mp4"
    }
  ]
}
```

Réponse **304** : pas de body, headers `ETag: "<version>"`. Le casque garde son manifest local.

Réponse **405** : méthode autre que GET/POST/OPTIONS.

Algo côté casque :
1. Comparer `videos[].id` avec les fichiers locaux (nommer les fichiers `<video_id>.<file_extension>`).
2. Télécharger ceux qui manquent via `download_url` (`UnityWebRequest`, suit les redirects, supporte `Range`).
3. Supprimer les fichiers locaux qui ne sont plus dans `videos`.
4. Si `download_url` expire en cours de route → rappeler `headset-manifest` (avec `force_full=1` pour re-signer même si la version n'a pas bougé).
5. Router le rendu selon `projection` + `stereo_mode`.
6. Une fois TOUT appliqué (téléchargements OK + bibliothèque rafraîchie), envoyer `headset-report-sync` avec `applied_manifest_version = manifest_version`.

## 5. `POST /headset-heartbeat`
**Auth : Bearer device_token**. Toutes les 5 min en background.

Body :
```json
{
  "battery_percent": 87,
  "storage_free_bytes": 34359738368,
  "storage_total_bytes": 137438953472,
  "app_version": "1.2.0"
}
```

Réponse :
```json
{
  "ok": true,
  "desired_manifest_version": 42,
  "applied_manifest_version": 41,
  "needs_sync": true
}
```
Si `needs_sync = true`, le casque doit lancer un cycle manifest → download → report **immédiatement** sans attendre son intervalle.

## 6. `POST /headset-report-sync`
**Auth : Bearer device_token**. Deux phases :

Démarrage :
```json
{ "phase": "started", "cause": "needs_sync" }
→ { "report_id": "uuid" }
```

Fin :
```json
{
  "phase": "finished",
  "report_id": "uuid",
  "status": "success" | "partial" | "failed" | "no_change",
  "downloaded_count": 3,
  "failed_count": 0,
  "deleted_count": 1,
  "total_bytes": 1234567890,
  "error_message": null,
  "applied_manifest_version": 42,
  "playlist_id": "uuid|null",
  "remote_video_count": 5,
  "local_video_count": 5,
  "visible_video_count": 5
}
```

### Règle d'application de la version

`headsets.applied_manifest_version` n'est mis à jour QUE si **toutes** ces conditions sont vraies :

1. `status` ∈ `{success, no_change}`
2. `applied_manifest_version` présent, entier > 0
3. `applied_manifest_version >= headsets.applied_manifest_version` (pas de retour arrière)
4. `applied_manifest_version <= headsets.desired_manifest_version` (pas de version inventée)
5. La version existe dans `manifest_versions(headset_id, version)` (le serveur l'a réellement servie)

Sinon : le report est stocké, `applied_manifest_version` reste inchangé, un log de rejet est émis.

### Réponse `phase=finished` (explicite)

```json
{
  "ok": true,
  "report_stored": true,
  "applied_updated": true,
  "accepted_applied_manifest_version": 42,
  "server_desired_manifest_version": 42,
  "server_previous_applied_manifest_version": 41,
  "reason": "ok"
}
```

`reason` ∈ `ok | rollback | above_desired | unknown_version | missing_applied_manifest_version | invalid_status | headset_not_found | report_not_found | skipped`.

Unity ne doit avancer son `lastApplied` local que si `applied_updated === true`
et `accepted_applied_manifest_version` égale la version envoyée.

### Statuts interdits côté casque

`pending` est **calculé côté serveur/dashboard** (`applied < desired`). Le casque ne doit JAMAIS envoyer `status: pending` ; le serveur répond `400`.

### Logique desired / applied

- Une mutation web (ajout vidéo, changement de playlist, etc.) incrémente `desired_manifest_version` via des triggers DB.
- Le casque détecte l'écart via `headset-heartbeat` (`needs_sync`) ou en appelant `headset-manifest`.
- Le casque envoie `applied_manifest_version` UNIQUEMENT après avoir tout téléchargé et rafraîchi sa bibliothèque.
- Le dashboard passe `À jour` SEULEMENT à ce moment-là.

### Note migration

Tous les casques actifs existants ont été bumpés à `desired=1, applied=0` (cause `initial_versioning_migration`). Ils apparaîtront `En attente` jusqu'au premier `headset-report-sync` réel — comportement attendu, pas de faux vert.

---

## Codes d'erreur

| HTTP | Sens | Action casque |
|---|---|---|
| 401 `Invalid device token` | Token révoqué | Effacer le token local → repasser en pairing |
| 403 `Headset revoked` | Admin a désactivé le casque | Idem |
| 404 `Headset not found` | Casque supprimé | Idem |
| 429 (à venir) | Trop de requêtes | Backoff |
| 5xx | Backend KO | Backoff exponentiel (1 min → 5 → 30 → 2 h) |

---

## Backoff recommandé

| Tentative | Attente avant retry |
|---|---|
| 1 | 1 min |
| 2 | 5 min |
| 3 | 30 min |
| 4+ | 2 h (max) |

Reset du compteur dès qu'une requête réussit.