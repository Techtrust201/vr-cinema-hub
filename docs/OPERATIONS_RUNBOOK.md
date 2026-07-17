# Runbook opérations — VR Ultimate

## Nouveau casque (résumé)

1. Mode développeur Quest → USB → accepter RSA  
2. Installer APK `builds/VR-Cinema-Quest.apk`  
3. Lancer l’app → code 6 chiffres  
4. Dashboard → Casques → Appairer  
5. Ajouter au groupe / assigner playlist  
6. Vérifier **Application active** (&lt; 2 min)  
7. Vérifier `desired == applied` après sync  

## Casque « hors ligne » alors qu’il est allumé

Cause normale : l’**application VR** n’a pas contacté le serveur récemment.  
Allumer le casque ne suffit pas.

Checklist :
- App ouverte ?  
- Wi‑Fi / Internet Quest ?  
- Token valide (pas révoqué) ?  
- Logs `[Heartbeat] Trigger=AppStart` ?

## Déploiements à appliquer après ce chantier

Migrations :
- `20260717080000_headset_contact_observability.sql`
- `20260717083000_atomic_pairing_token_claim.sql`

Edge Functions :
- `headset-heartbeat`
- `headset-manifest`
- `headset-report-sync`
- `headset-pair-claim`
- `headset-pair-poll`

## Prototype historique

`Techtrust201/vr_ultimate` est un **prototype historique**. Ne pas l’utiliser comme architecture de production.
