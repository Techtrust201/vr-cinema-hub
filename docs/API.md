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

## 4. `POST /headset-manifest`
**Auth : Bearer device_token**. Body : `{}` (vide).

Réponse :
```json
{
  "headset_id": "uuid",
  "generated_at": "...",
  "url_expires_in": 900,
  "videos": [
    {
      "id": "uuid",
      "name": "Plage 360.mp4",
      "size_bytes": 1234567890,
      "duration_seconds": 240,
      "format": "mp4",
      "download_url": "https://…?token=…"   // signée 15 min
    }
  ]
}
```
Algo côté casque :
1. Comparer `videos[].id` avec les fichiers locaux (nommer les fichiers `<video_id>.mp4`).
2. Télécharger ceux qui manquent via `download_url` (`UnityWebRequest`, suit les redirects, supporte `Range` pour reprise).
3. Supprimer les fichiers locaux qui ne sont plus dans `videos`.
4. Si `download_url` expire en cours de route → rappeler `headset-manifest`.

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

## 6. `POST /headset-report-sync`
**Auth : Bearer device_token**. Deux phases :

Démarrage :
```json
{ "phase": "started" }
→ { "report_id": "uuid" }
```
Fin :
```json
{
  "phase": "finished",
  "report_id": "uuid",
  "status": "success" | "partial" | "failed",
  "downloaded_count": 3,
  "failed_count": 0,
  "deleted_count": 1,
  "total_bytes": 1234567890,
  "error_message": null
}
```

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