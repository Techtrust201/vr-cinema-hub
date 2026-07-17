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
