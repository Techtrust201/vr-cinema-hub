
# Plan — VR Ultimate en mode plateforme cloud + agent local

## Vision

Aujourd'hui : chaque PC doit installer Node, ADB, cloner le repo, configurer un dossier — bloquant pour un client non-technique.

Demain :
- **Toi et ton client** vous connectez à `vr-ultimate.lovable.app` depuis n'importe où
- **Vous voyez la même bibliothèque de vidéos** (mutualisée, dans le cloud)
- **Chacun installe un mini-programme "Agent" en 1 clic** sur son PC, près de ses casques
- L'agent télécharge automatiquement les vidéos depuis le cloud et les pousse via ADB sur les Quest connectés
- Zéro terminal, zéro variable d'environnement

```text
   ┌─────────────────┐         ┌──────────────────┐
   │  TOI (web app)  │         │ CLIENT (web app) │
   │  upload vidéos  │         │ choisit & déclen-│
   │                 │         │ che la sync      │
   └────────┬────────┘         └──────────┬───────┘
            │                             │
            └──────────┬──────────────────┘
                       ▼
            ┌──────────────────────┐
            │  Lovable Cloud       │
            │  - Auth (login)      │
            │  - DB (bibliothèque) │
            │  - Storage (vidéos)  │
            └──────────┬───────────┘
                       │
       ┌───────────────┴────────────────┐
       ▼                                ▼
 ┌───────────┐                    ┌───────────┐
 │ Agent TOI │                    │Agent CLIENT│
 │ (ton PC)  │                    │ (son PC)   │
 │ + ADB     │                    │ + ADB      │
 └─────┬─────┘                    └─────┬──────┘
       ▼                                ▼
   tes Quest                       ses Quest
```

## Périmètre

### Inclus dans ce plan
1. Backend cloud (auth, bibliothèque vidéos, storage)
2. Refonte de la web app pour parler au cloud (plus de localhost:3001 obligatoire)
3. Spécification + premier prototype de l'**Agent local** (binaire packagé pour Windows + Mac + Linux)
4. Système de **pairing** Agent ↔ compte utilisateur

### Hors périmètre (à faire après)
- Streaming temps-réel (player 360° dans le navigateur reste optionnel)
- Multi-équipes / facturation
- App Store / Play Store

## Architecture cible

### 1. Backend cloud — Lovable Cloud (Supabase)

**Auth** : email/password + Google. 2 rôles :
- `admin` (toi) : upload/supprime des vidéos, voit tout
- `operator` (ton client) : voit la bibliothèque, déclenche les syncs sur ses casques

**Tables** :
- `profiles` (user_id, display_name, avatar)
- `user_roles` (user_id, role) — pattern sécurisé documenté
- `videos` (id, name, library_type (location/animation), format (360/180/stereo), size_bytes, storage_path, uploaded_by, created_at)
- `agents` (id, user_id, name, last_seen_at, public_ip, version) — un agent par PC
- `devices` (id, agent_id, serial, model, ip_address, battery, storage_total_gb, storage_used_gb, last_seen_at)
- `sync_jobs` (id, agent_id, device_id, video_ids[], status, progress_pct, log, started_at, finished_at)

**Storage bucket** `videos/` (privé, accès via signed URLs)
- Upload résumable (TUS) pour les vidéos multi-GB
- Quota par workspace (à définir)

### 2. Web app (refonte)

- **Login obligatoire** (Lovable Cloud auth)
- **Bibliothèques** : grille des vidéos cloud. Admin a un bouton "Upload" (drag & drop, multi-fichiers, progress bar avec resume si la connexion coupe). Operator a seulement "Voir / Sélectionner".
- **Casques** : liste des Quest détectés par **mon Agent local** (chaque user voit seulement ses casques à lui via son agent)
- **Synchronisation** : sélectionner casque + vidéos → l'app envoie un `sync_job` au cloud → l'agent du user le pickup → push ADB local → remonte le progress en temps réel
- **Paramètres** : bouton "Télécharger l'Agent" + code de pairing à 6 chiffres
- **Plus jamais** : champ "chemin de stockage local", variable `VIDEO_STORAGE_PATH`, URL ngrok

### 3. Agent local (le morceau critique)

Petit binaire signé qui s'installe en 1 clic. Idéalement basé sur **Tauri** (binaires natifs ~5 MB, multi-OS) ou Go (zéro dépendance runtime).

**Fonctions** :
- Auto-démarrage avec l'OS (systemd / launchd / Windows service)
- Système tray icon : "Agent VR Ultimate ✓ Connecté"
- Au premier lancement : ouvre une page web "Coller le code de pairing" → s'enregistre dans `agents` table avec le user_id
- Tourne en arrière-plan :
  - Détecte les Quest via ADB toutes les 30s → met à jour `devices` table
  - Poll `sync_jobs` toutes les 5s (ou WebSocket / Supabase Realtime) pour les jobs en attente
  - Pour chaque job : télécharge les vidéos depuis le bucket (avec cache local pour éviter de re-download), puis `adb push` vers le casque, remonte le progress
- **Embarque ADB binaire** (~5 MB) → zéro install à faire pour le client

**Installer one-click** : `.exe` Windows / `.dmg` Mac / `.AppImage` ou `.deb` Linux. Téléchargeable depuis la page Paramètres.

### 4. Sécurité

- Toutes les routes cloud protégées par RLS sur `auth.uid()`
- L'agent s'authentifie au cloud via un token long-lived issu du pairing
- Storage bucket : signed URLs valides 1h max, générées à la demande pour l'agent
- Le bucket n'est jamais public

## Étapes d'implémentation (ordre recommandé)

### Phase 1 — Cloud foundation (1 itération web app)
1. Activer Lovable Cloud
2. Créer schéma DB (videos, profiles, user_roles, agents, devices, sync_jobs)
3. Setup auth email/password + Google + RLS + has_role function
4. Storage bucket `videos` + policies
5. Page Login + protected routes
6. Page Bibliothèques cloud (lecture des `videos` table + signed URLs pour preview)
7. Page Upload (admin only, drag & drop avec progress)

### Phase 2 — Décorrélation de l'agent (web app continue de fonctionner)
8. Supprimer la dépendance à `localhost:3001` dans la web app
9. Remplacer les appels ADB directs par des appels à la table `sync_jobs`
10. Page Casques : liste depuis `devices` table (peuplée par l'agent)
11. Page Paramètres : section "Mon agent" avec code de pairing

### Phase 3 — Agent local (nouveau repo séparé)
12. Scaffold Tauri (ou Go) avec ADB binaire embarqué
13. Implémenter pairing (UI minimale + appel API `POST /agents/pair`)
14. Implémenter le poll des `sync_jobs` + Supabase Realtime
15. Implémenter le download depuis bucket + cache local
16. Implémenter `adb push` avec progress remonté
17. Packaging multi-OS (GitHub Actions, signing Windows + notarization Mac)
18. Page publique de téléchargement avec le bon installeur selon l'OS

### Phase 4 — Polish
19. Notifications dans la web app quand l'agent commence/finit une sync
20. Gestion des erreurs (casque déco en cours de sync, vidéo corrompue…)
21. Quotas / limites par user
22. Documentation client (1 page : "télécharger, pairer, c'est tout")

## Coût & contraintes

- **Lovable Cloud** : auth/DB gratuits jusqu'à un certain seuil. Storage des vidéos VR (souvent 2–10 GB chacune) coûte cher → prévoir surveillance des quotas ou option "lien vidéo externe" (S3/Backblaze) en alternative
- **Bande passante** : chaque vidéo est uploadée 1× par toi, téléchargée 1× par chaque agent qui en a besoin
- **Signing des binaires** : nécessite un certificat développeur Windows (~100 €/an) et un compte Apple Developer (99 $/an) pour que les clients n'aient pas de warning "logiciel non vérifié"

## Risques majeurs

1. **Taille des vidéos** : upload d'un 8 GB depuis un navigateur peut échouer si la connexion coupe → impérativement TUS / resumable upload
2. **L'agent doit être ultra fiable** : c'est le seul code qui tourne chez le client, n'importe quel crash bloque tout → tests + auto-restart + logs uploadés au cloud
3. **Pairing UX** : trouver le bon équilibre entre simple (1 code à 6 chiffres) et sécurisé (pas piratable)
4. **Distribution** : sans signing, Windows SmartScreen bloque le `.exe` → ton client appellera

## Décisions à valider avant que je code

1. **OK pour Lovable Cloud comme backend** ? (alternative : Supabase externe)
2. **OK pour Tauri pour l'Agent** ? (alternatives : Go natif, Electron — Electron est lourd mais plus simple à packager)
3. **OK pour mettre les vidéos dans le storage cloud** ? Ou tu préfères que toi tu héberges les vidéos ailleurs (Backblaze, ton propre S3) et seules les métadonnées sont dans Lovable Cloud ?
4. **Phase 1 d'abord, on valide en vrai, puis Phase 2/3** ? Ou tu veux que je sorte tout en un seul gros chantier ?

Une fois tes réponses, je commence par la Phase 1.
