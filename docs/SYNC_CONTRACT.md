# Contrat de synchronisation VR Ultimate

## Principe

Le serveur ne détecte **pas** l’alimentation physique d’un Meta Quest.
Il détecte uniquement que **l’application VR** a contacté une Edge Function récemment.

| Situation | Ce que voit le dashboard |
|---|---|
| Casque allumé, app fermée | Application hors ligne / récemment vue (selon `last_seen_at`) |
| Casque allumé, app ouverte sans Internet | Application hors ligne |
| App ouverte avec Internet | Application active (`last_seen_at` &lt; 2 min) |
| App en veille | Passe progressivement à récemment vue puis hors ligne |
| Token révoqué | Révoqué |
| Manifest en attente | `desired > applied` |
| Sync terminée et acceptée | `applied == desired` après report `applied_updated=true` |

## Sources de vérité

1. **Ciblage** : `headsets_for_playlist` + triggers SQL → `desired_manifest_version`
2. **Contenu** : `headset-manifest` → snapshot `manifest_versions`
3. **Confirmation** : `headset-report-sync` phase `finished` avec `applied_updated`
4. **Ordre** : `playlists.position` (ordre des dossiers) et `playlist_videos.position` (ordre de lecture). Le casque ne trie rien : il suit l'ordre du tableau `playlists` du manifeste.

## Ce qui réveille un casque

| Modification | Incrément |
|---|---|
| Ajout ou retrait d'une vidéo dans une playlist | un par vidéo |
| Réordonnancement des vidéos (`reorder_playlist_videos`) | un seul, quel que soit le nombre de vidéos déplacées |
| Renommage ou réordonnancement des playlists (`reorder_playlists`) | un seul, et seulement si le nom ou la position change |
| Description d'une playlist | aucun (non affichée dans le casque) |
| Attribution, groupe, réglage d'un film | inchangé |

Les réordonnancements passent par des RPC qui refusent une liste ne correspondant plus au contenu actuel (`hint: playlist_changed`). Ainsi, un second onglet ouvert ne peut pas faire disparaître une vidéo ajoutée entre-temps.

## Manifeste v4 et applications plus anciennes

`schema_version` 4 ajoute `playlists[]` sans rien changer à `videos[]`. Une application 1.1.7 ignore le champ et garde sa grille à plat. Elle le perd même en enregistrant le manifeste, puisque son modèle ne le déclare pas. Une application 1.1.8 qui retrouve un manifeste local sans `playlists` ne doit donc pas envoyer `known_version` : sinon le serveur répondrait 304 et la bibliothèque resterait à plat jusqu'au prochain changement de contenu.

## Heartbeat

Réponse :

```json
{
  "ok": true,
  "desired_manifest_version": 12,
  "applied_manifest_version": 11,
  "needs_sync": true
}
```

Si `needs_sync=true`, Unity doit lancer un cycle immédiat (`HeartbeatNeedsSync`).

## Report finished

Réponse explicite :

```json
{
  "ok": true,
  "report_stored": true,
  "applied_updated": true,
  "accepted_applied_manifest_version": 12,
  "server_desired_manifest_version": 12,
  "server_previous_applied_manifest_version": 11,
  "reason": "ok"
}
```

Unity ne met à jour `lastAppliedManifestVersion` local **que si** `applied_updated=true`
et `accepted_applied_manifest_version` égale la version envoyée.
