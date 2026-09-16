# Architecture VR Ultimate

## Composants

| Composant | Rôle |
|---|---|
| Dashboard React (`vr-cinema-hub`) | Admin : vidéos, playlists, groupes, casques, sync |
| Supabase Postgres | Source de vérité assignments + versions manifest |
| Edge Functions Deno | Contrat device (pair / manifest / heartbeat / report) |
| App Unity Quest (`vr-cinema-quest-app-unity`) | Pairing, sync, bibliothèque 3D, lecture |
| Cloudflare R2 | Fichiers vidéo et miniatures, bucket privé |

## Stockage des fichiers

La colonne `videos.origin` dit où vivent les octets d'une vidéo — `r2`,
`supabase` ou `disk`. C'est une propriété de la vidéo, pas de l'installation :
un parc peut donc être migré film par film, sans coupure.

Le bucket n'est jamais public. `headset-manifest` signe une URL par fichier,
valable 6 h ; les identifiants R2 ne quittent jamais les Edge Functions.

Détail complet, coûts et diagnostic : **[`STOCKAGE.md`](./STOCKAGE.md)**.

## Flux principal

```
Admin mutate playlist/group/assignment
        ↓ trigger SQL bump_headset_versions
headsets.desired_manifest_version++
        ↓
Quest heartbeat → needs_sync=true → SyncCycle
        ↓
POST headset-manifest (200) → prepare files → active_manifest.json
        ↓
POST headset-report-sync finished
        ↓ applied_updated=true
headsets.applied_manifest_version = desired
```

## Présence

`last_seen_at` = dernier contact app (manifest | heartbeat | sync_report).
Colonnes optionnelles : `last_heartbeat_at`, `last_contact_source`.

Seuils UI :
- &lt; 2 min → Application active
- 2–10 min → Application récemment vue
- &gt; 10 min → Application hors ligne
- null → Jamais connectée
- status=revoked → Révoqué
