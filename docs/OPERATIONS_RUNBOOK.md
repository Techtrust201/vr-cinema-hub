# Runbook opérations — VR Cinema Hub

> **Nouveau casque ?** → [`HEADSET_ONBOARDING.md`](./HEADSET_ONBOARDING.md) (guide complet Ubuntu A→Z).

## Déploiements backend

Migrations casques (si pas encore appliquées) :
- `20260717080000_headset_contact_observability.sql`
- `20260717083000_atomic_pairing_token_claim.sql`

Edge Functions device :
- `headset-heartbeat`
- `headset-manifest`
- `headset-report-sync`
- `headset-pair-claim`
- `headset-pair-poll`

## Prototype historique

`Techtrust201/vr_ultimate` est un **prototype historique**. Ne pas l’utiliser comme architecture de production.
