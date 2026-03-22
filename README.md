# 🎬 VR Ultimate Dashboard

Dashboard de gestion de contenu VR pour casques Meta Quest — synchronisation de vidéos 360°/180° via ADB, gestion de bibliothèques, suivi des appareils.

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Comprendre l'application](#comprendre-lapplication)
3. [Est-ce qu'il faut Unity ou un moteur 3D ?](#unity--non)
4. [Comment fonctionnent les vidéos VR ?](#comment-fonctionnent-les-vidéos-vr)
5. [Automatisation complète : téléchargement + sync](#automatisation-complète--téléchargement--sync)
6. [Où stocker les vidéos](#où-stocker-les-vidéos)
7. [Lecture sur le casque (sans Unity)](#lecture-sur-le-casque)
8. [Architecture](#architecture)
9. [Structure des fichiers](#structure-des-fichiers)
10. [Prérequis](#prérequis)
11. [Installation](#installation)
12. [3 modes de fonctionnement](#3-modes-de-fonctionnement)
13. [Guide connexion Meta Quest](#guide-connexion-meta-quest)
14. [Pages de l'application](#pages-de-lapplication)
15. [Démo vs Réel](#démo-vs-réel)
16. [Ce qui reste à faire](#ce-qui-reste-à-faire)
17. [Troubleshooting](#troubleshooting)
18. [Stack technique](#stack-technique)

---

## Vue d'ensemble

VR Ultimate Dashboard est une application **fullstack locale** composée de :

- **Frontend React** — dashboard web avec 7 pages, données persistées dans le navigateur
- **Backend Express** — serveur Node.js local qui exécute les commandes `adb` (Android Debug Bridge)

L'application gère :
- 📚 **Bibliothèques** de vidéos VR (360° et 180°, stéréo SBS/OU/Mono) organisées en playlists
- 🥽 **Casques Meta Quest** — connexion USB et Wi-Fi ADB, suivi batterie/stockage
- 🔄 **Synchronisation** — push `adb` des vidéos vers les casques avec logs en temps réel
- 📊 **Statistiques** — usage, formats, distribution
- 📤 **Export** — manifeste JSON/CSV des bibliothèques

---

## Comprendre l'application

### Rôles respectifs

| Élément | Rôle | Où |
|--------|------|-----|
| **VR Ultimate Dashboard** (cette app) | Gestion et transfert — organiser les vidéos, les envoyer sur le casque. Pas un lecteur VR. | PC (navigateur) |
| **SkyBox VR** | Lecteur VR sur le casque — lire les vidéos en immersion une fois transférées | Meta Quest (casque) |
| **Player 360° web** | Aperçu optionnel dans le navigateur pour vérifier une vidéo avant la sync | PC (navigateur) |

### ADB en bref

**ADB (Android Debug Bridge)** est un outil de Google pour communiquer avec les appareils Android. Le Meta Quest tourne sous Android. L'app utilise ADB pour :
- transférer les fichiers vidéo (`adb push`) du PC vers le casque ;
- détecter les casques connectés (USB ou Wi-Fi) ;
- lire batterie, stockage, adresse IP.

ADB doit être installé sur ton PC (voir [Prérequis](#prérequis)).

### Lecture hors ligne

Une fois les vidéos synchronisées, elles sont **stockées sur le casque**. Aucune connexion internet n'est requise pour les regarder — SkyBox lit les fichiers en local. Tu peux emmener le casque n'importe où.

---

## Unity ? Non.

> **Tu n'as absolument pas besoin de Unity, Unreal Engine, ni d'aucun moteur de jeu.**

Voici pourquoi cette confusion arrive souvent : quand on pense "VR", on pense à des jeux VR ou des expériences interactives — qui eux nécessitent effectivement Unity.

**Mais ici on ne fait pas ça.** On distribue des **vidéos préenregistrées** en 360° sur des casques Meta Quest. C'est exactement comme copier un film `.mp4` sur une clé USB, sauf que le fichier contient une projection sphérique que le casque lit en immersion.

### Ce que fait cette app concrètement :
```
Ta bibliothèque de fichiers .mp4 VR
        ↓
  VR Ultimate Dashboard
        ↓
  adb push (transfert USB/Wi-Fi)
        ↓
  Casque Meta Quest
        ↓
  SkyBox Player (app gratuite sur le casque)
        ↓
  Immersion totale 360°
```

Aucune compilation, aucun moteur 3D côté production. Juste du **transfert de fichiers vidéo**.

L'app propose aussi un aperçu 360° dans le navigateur (bouton « 360° ») pour vérifier les vidéos avant transfert. La lecture immersive finale se fait uniquement sur le casque avec SkyBox.

---

## Comment fonctionnent les vidéos VR ?

### Formats de vidéo VR

Une vidéo VR est un fichier `.mp4` classique, mais avec une particularité : l'image contient **toute la sphère à plat**, comme une carte du monde planisphère.

Il y a plusieurs formats selon la façon dont la sphère est "dépliée" :

| Format | Description | Usage |
|--------|-------------|-------|
| **360° Équirectangulaire** | Toute la sphère dans une image 2:1 | Le plus commun |
| **180° Semi-sphérique** | Juste l'hémisphère avant | Caméras comme Insta360 EVO |
| **Mono** | Une seule image (pas de relief) | Contenu simple |
| **Side-by-Side (SBS)** | Image gauche + image droite côte à côte | Relief 3D stéréoscopique |
| **Over-Under (OU)** | Image gauche dessus + droite dessous | Relief 3D stéréoscopique |

### D'où viennent ces vidéos ?

Tu peux obtenir des vidéos VR de plusieurs sources :

**🎥 Tourner les tiennes :**
- Caméra Insta360 X4, GoPro MAX, Ricoh Theta Z1...
- Elles exportent directement en MP4 équirectangulaire

**💾 Télécharger depuis des plateformes :**
- [VeeR VR](https://veer.tv) — contenu gratuit et premium
- [Within (Oculus TV)](https://www.oculus.com/experiences/quest/) — films VR officiels
- [Vimeo 360](https://vimeo.com/channels/360video) — créateurs indépendants
- [YouTube 360°](https://www.youtube.com/360) — puis télécharger avec yt-dlp

**🎨 Créer en post-production :**
- Adobe Premiere / DaVinci Resolve peuvent exporter en 360°
- Renders 3D (Blender, Cinema 4D) en projection équirectangulaire

### Automomatisation complète : téléchargement + synchronisation

**Limitation actuelle** : L'app ne télécharge pas les vidéos depuis internet. Elle transfère uniquement des fichiers déjà présents sur le PC vers le casque.

**Automatisation avec yt-dlp** : Pour une chaîne complète (YouTube, VeeR, etc. → PC → Quest), utilisez `yt-dlp` en amont pour télécharger, puis lancez la sync depuis l'app.

1. **Installer yt-dlp** : https://github.com/yt-dlp/yt-dlp (ou `pip install yt-dlp`)

2. **Télécharger dans le dossier configuré** (ex. `VIDEO_STORAGE_PATH` ou le chemin défini dans Paramètres) :
   ```bash
   yt-dlp -f "best[vcodec^=avc1]" -o "/videos/vr-ultimate/%(title)s.%(ext)s" "URL_VIDEO"
   ```
   Adapte le chemin de sortie au tien (ex. `C:\Videos\vr-ultimate\` sur Windows).

3. **Dans l'app** : ajouter les vidéos aux bibliothèques si besoin, puis lancer la synchronisation vers le casque.

**Évolution possible** : Une future fonctionnalité pourrait intégrer le téléchargement directement dans l'app (yt-dlp ou API des plateformes) pour tout automatiser d'un clic.

### Convention de nommage recommandée

Les fichiers sont identifiés par leur **nom exact**. Utilise une convention lisible :

```
[Lieu ou Titre]_[Format]_[Résolution]_[Stéréo optionnel].mp4

Exemples :
  Notre-Dame_Reconstruction_360_4K.mp4
  NYC_TimesSquare_360_SBS_Day.mp4
  EscapeRoom_VR_180_SBS_8K.mp4
  Concert_Daft_Punk_360_mono.mp4
```

---

## Où stocker les vidéos

### Sur ton ordinateur (source)

Les vidéos doivent exister **localement** sur ta machine. L'emplacement se configure dans l'app → **Paramètres** → "Chemin du stockage vidéo".

Défaut : `/videos/vr-ultimate/`

```
/videos/vr-ultimate/              ← chemin configuré dans les Paramètres
├── Notre-Dame_360_4K.mp4         ← le fichier source
├── EscapeRoom_180_SBS_8K.mp4
├── NYC_TimesSquare_360_SBS.mp4
└── ...
```

> Les fichiers ne sont **pas** dans le projet — c'est ton disque dur personnel. L'app ne les copie pas, elle les **envoie directement** depuis leur emplacement vers le casque.

### Sur le casque Meta Quest (destination)

Après la synchronisation ADB, les fichiers atterrissent dans :

```
/sdcard/Movies/VR-Ultimate/       ← dossier automatiquement créé par l'app
├── Notre-Dame_360_4K.mp4
├── EscapeRoom_180_SBS_8K.mp4
└── ...
```

C'est le chemin standard lu par SkyBox Player et le gestionnaire de médias Quest.

---

## Lecture sur le casque

### Sans Unity — comment ça marche réellement

Le Meta Quest est un Android. Les fichiers MP4 dans `/sdcard/Movies/` sont automatiquement indexés par le **gestionnaire de médias Android**. N'importe quelle app de lecture VR peut les lire.

### Applications recommandées sur le casque

| App | Prix | Avantages |
|-----|------|-----------|
| **SkyBox VR Video Player** | Gratuit | Meilleur player, détecte automatiquement SBS/OU/360/180, sous-titres, streaming local |
| **Pigasus VR Media Player** | ~5€ | Streaming réseau (SMB/DLNA), bonne interface |
| **Gestionnaire Quest natif** | Intégré | Basique, liste les vidéos mais sans options avancées |
| **DeoVR** | Gratuit | Populaire pour contenu adulte, mais marche pour tout |

### Processus complet de bout en bout

```
1. Tu as un fichier  →  /Users/toi/VR-Videos/Film360.mp4
2. npm run dev:all   →  Lance l'app sur localhost:8080
3. Casque branché    →  adb devices détecte le serial
4. Dans l'app        →  Synchronisation → Lancer ADB réel
5. Côté serveur      →  adb push /Users/toi/VR-Videos/Film360.mp4 /sdcard/Movies/VR-Ultimate/
6. Sur le casque     →  Ouvrir SkyBox → onglet "Local" → Film360.mp4 apparaît
7. Play              →  Immersion 360° complète
```

Durée du transfert : environ **1 GB/min** en USB 3.0, **100-200 MB/min** en Wi-Fi.

### Le player 360° dans l'app (aperçu desktop)

L'app inclut un player 360° **dans le navigateur** (bouton "360°" dans l'aperçu vidéo). Ce n'est PAS l'expérience VR réelle — c'est juste pour vérifier que la vidéo est correcte avant de la transférer. La vraie immersion se passe dans le casque.

**Aperçu web (optionnel)** — ce player sert à la prévisualisation, pas à remplacer SkyBox.

**Fonctionnement du player web :**
- Clic bouton "360°" → canvas Three.js avec sphère inversée
- Glisser la souris pour regarder autour
- Sur mobile/tablette : bouton "Gyro" pour orienter en bougeant l'appareil (iOS demande une permission)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│               TON ORDINATEUR (macOS / Linux / Windows)                      │
│                                                                     │
│  ┌─────────────────────────┐     ┌──────────────────────────────┐  │
│  │   FRONTEND (React/Vite)  │     │    BACKEND (Express Node.js)  │  │
│  │   http://localhost:8080  │────▶│    http://localhost:3001      │  │
│  │                          │     │                               │  │
│  │  src/pages/              │     │  server/sync-server.js        │  │
│  │  src/components/         │     │                               │  │
│  │  src/store/vrStore.ts    │     │  GET  /api/health             │  │
│  │  src/lib/serverApi.ts    │     │  GET  /api/devices            │  │
│  │                          │     │  GET  /api/device-status/:s   │  │
│  │  Zustand (persist)       │     │  GET  /api/device-ip/:serial  │  │
│  │  ↕ localStorage          │     │  POST /api/connect            │  │
│  └─────────────────────────┘     │  POST /api/tcpip/:serial      │  │
│                                   │  POST /api/sync/start         │  │
│  Proxy Vite :                     │  GET  /api/sync/stream/:jobId │  │
│  /api/* → :3001                   │  GET  /api/video/:name        │  │
│  (développement uniquement)        │                               │  │
│                                   │  ↕ child_process.spawn()      │  │
│                                   └──────────────┬───────────────┘  │
│                                                   │                  │
│                                                   ▼                  │
│                                           ADB (adb devices,          │
│                                           adb push, adb shell…)      │
│                                                   │                  │
└───────────────────────────────────────────────────┼──────────────────┘
                                                    │ USB / Wi-Fi
                                            ┌───────┴────────┐
                                            │   Meta Quest   │
                                            │  (Quest 2/3/Pro)│
                                            └────────────────┘
```

### Flux de données — Synchronisation en temps réel

```
Utilisateur clique "Lancer la sync"
  → Sync.tsx appelle startSync() dans serverApi.ts
    → POST /api/sync/start → { jobId }
      → sync-server.js démarre spawn("adb push ...") en arrière-plan
    → Sync.tsx ouvre EventSource sur /api/sync/stream/:jobId
      → Chaque ligne stdout d'adb push est émise en SSE
        → SyncLog mis à jour ligne par ligne en temps réel
```

---

## Structure des fichiers

```
vr-ultimate/
│
├── server/
│   └── sync-server.js          ← Serveur Express + toutes les routes ADB
│                                  (spawn pour SSE, execSync pour les autres)
│
├── src/
│   ├── lib/
│   │   └── serverApi.ts        ← Bridge fetch() frontend ↔ backend
│   │                              (startSync, createSyncStream, fetchDeviceIp...)
│   │
│   ├── store/
│   │   └── vrStore.ts          ← État global Zustand (persist localStorage)
│   │                              (devices, libraries, settings, syncLogs)
│   │
│   ├── pages/
│   │   ├── Index.tsx           ← Dashboard principal (stats, dernière sync)
│   │   ├── Libraries.tsx       ← Gestion des bibliothèques et playlists
│   │   ├── Devices.tsx         ← Casques ADB (USB + Wi-Fi + auto-détection IP)
│   │   ├── Sync.tsx            ← Lancer une sync, logs SSE en temps réel
│   │   ├── Stats.tsx           ← Statistiques & graphiques
│   │   ├── Export.tsx          ← Export JSON/CSV
│   │   └── Settings.tsx        ← Config serveur, chemins, token, ngrok
│   │
│   └── components/
│       └── dashboard/
│           ├── DashboardLayout.tsx   ← Sidebar + badge serveur
│           ├── DeviceCard.tsx        ← Carte casque (batterie, stockage, Wi-Fi)
│           ├── VideoRow.tsx          ← Ligne vidéo dans une playlist
│           ├── VideoPreviewModal.tsx ← Player HTML5 + player 360° Three.js + gyro
│           ├── SyncLogItem.tsx       ← Entrée de log de sync
│           └── StatsCard.tsx         ← Carte statistique
│
├── vite.config.ts              ← Proxy /api → :3001, port :8080
└── package.json                ← Scripts npm (dev, dev:all, build, start)
```

---

## Prérequis

### Logiciels (à installer une fois)

#### 1. Node.js ≥ 18
```bash
node --version   # doit afficher v18.x ou plus
```
Télécharger : https://nodejs.org

#### 2. ADB (Android Debug Bridge)

- **macOS** : `brew install android-platform-tools`
- **Linux (Debian/Ubuntu)** : `sudo apt install android-tools-adb`
- **Linux (Fedora)** : `sudo dnf install android-tools`
- **Windows** : Télécharger [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools), extraire l'archive et ajouter le dossier au PATH

Vérification : `adb version` → doit afficher Android Debug Bridge version 1.0.x ou plus

#### 3. Un casque Meta Quest (2, 3 ou Pro)
- Mode développeur **activé** sur le casque (voir guide ci-dessous)
- Un câble USB **data** (pas juste charge) — tester avec `adb devices` après branchement

### Fichiers vidéo

Les vidéos doivent être présentes **localement** sur ta machine dans le chemin configuré dans les Paramètres (défaut : `/videos/vr-ultimate/`).

Les noms de fichiers dans l'app doivent correspondre **exactement** aux fichiers sur disque (casse, espaces, extension).

---

## Installation

```bash
# 1. Cloner le projet
git clone <repo-url>
cd vr-ultimate

# 2. Installer les dépendances (React + Express + tout)
npm install

# 3. Lancer en développement (Vite + serveur ADB en parallèle)
npm run dev:all
```

→ Frontend disponible sur http://localhost:8080  
→ API disponible sur http://localhost:3001/api/health

---

## 3 modes de fonctionnement

Le **Mode 1 (Démo)** permet d'explorer l'interface sans serveur ni casque. Pour un usage réel (synchroniser des vidéos, utiliser les casques), utilisez le **Mode 2** (dev) ou le **Mode 4** (production).

### Mode 1 — Démo (aucun serveur, aucun casque)

Aucune configuration requise. Le frontend fonctionne avec des données simulées dans le store Zustand. La synchronisation est **simulée** (pas d'ADB réel). Parfait pour explorer l'interface. Pour synchroniser de vraies vidéos et utiliser les casques, lancez `npm run dev:all` (Mode 2) ou `npm start` après `npm run build` (Mode 4).

```bash
# Juste le frontend
npm run dev
# → http://localhost:8080 avec données de démo
```

**Vidéos en mode démo — comment ça marche :**

Les vidéos listées (EscapeRoom_VR_180_SBS_8K.mp4, Notre-Dame_Reconstruction_360_4K.mp4, etc.) sont **fictives** : elles n'existent pas sur ton disque. C'est du contenu de démonstration pour montrer l'interface.

- **Sans serveur** (`npm run dev`) : l'aperçu vidéo affiche "Aperçu non disponible — Démarrez le serveur local pour lire".
- **Avec serveur** (`npm run dev:all`) : quand tu cliques sur une vidéo, l'app demande le fichier au serveur → 404 (fichier fictif). Dans ce cas, l'app charge automatiquement une **vidéo 360° d'exemple** (hébergée en ligne) pour que tu puisses tester le lecteur, le bouton 360° et le gyroscope. Un message "Vidéo d'exemple — les fichiers de démo sont fictifs" s'affiche.
- **Mode réel** : quand tu ajoutes de vraies vidéos dans le chemin configuré, elles sont lues directement depuis ton disque.

### Mode 2 — Local (serveur + casque USB)

```bash
# Lance Vite :8080 ET Express :3001 en même temps
npm run dev:all
```

Le badge en haut à droite passe **vert** quand le serveur répond. Les boutons ADB deviennent actifs.

### Mode 3 — Preview Lovable + ngrok

Quand tu utilises le preview Lovable (`https://xxx.lovable.app`), les appels `/api` ne peuvent pas atteindre ton `localhost`. Solution : exposer ton serveur local via un tunnel HTTPS.

```bash
# Terminal 1 — serveur Express local
node server/sync-server.js

# Terminal 2 — tunnel ngrok
# Installation selon l'OS :
#   macOS : brew install ngrok/ngrok/ngrok
#   Linux / Windows : https://ngrok.com/download
ngrok http 3001
# → Forwarding https://abc123.ngrok-free.app → http://localhost:3001
```

Puis dans l'app → **Paramètres** → "URL publique (ngrok)" → coller `https://abc123.ngrok-free.app` → Sauvegarder.

### Mode 4 — Production (tout sur un seul port)

```bash
npm run build       # compile le React dans ./dist/
npm start           # Express sert à la fois l'API et le React depuis :3001
# → http://localhost:3001
```

---

## Guide connexion Meta Quest

### Étape 1 — Activer le mode développeur sur le casque

1. Créer un compte Meta Developer (gratuit) : https://developer.oculus.com
2. Dans l'app Meta Quest sur ton téléphone → appareil → **Paramètres développeur** → activer
3. Sur le casque : **Paramètres** → **Système** → **Développeur** → Activer le mode USB

### Étape 2 — Connexion USB

1. Brancher le casque à ton ordinateur avec un câble USB **data**
2. Sur le casque, accepter la popup **"Autoriser le débogage USB ?"** → cocher "Toujours autoriser cet ordinateur"
3. Vérifier :
```bash
adb devices
# → List of devices attached
# → 1WMHHA000X0000  device     ← ✅ casque détecté
```

Si tu vois `unauthorized` → remettre le casque, accepter à nouveau la popup.  
Si tu vois rien → câble non data, ou mode développeur non activé.

### Étape 3 — Dans l'app

1. Dans **Paramètres**, lancer `npm run dev:all` et cliquer "Tester" → badge vert
2. Dans **Casques** → "Détecter via ADB" → le casque apparaît avec son serial
3. Cliquer "Ajouter" → remplir le nom et la bibliothèque assignée

### Étape 4 — Préparer le Wi-Fi (optionnel mais recommandé)

Le Wi-Fi permet de synchroniser **sans câble** tant que le casque est sur le même réseau Wi-Fi.

1. Brancher le casque en USB (étapes 1-3 faites)
2. Dans **Casques** → survoler la carte du casque connecté → cliquer **"Préparer Wi-Fi"**
   - L'app envoie `adb tcpip 5555` au serveur
   - **Automatiquement**, l'IP Wi-Fi du casque est lue depuis ADB (`adb shell ip addr show wlan0`)
   - Le modal "Wi-Fi ADB" s'ouvre avec l'IP **déjà pré-remplie** — plus rien à chercher manuellement
3. Cliquer "Connecter" dans le modal
4. Débrancher le câble USB — le casque reste accessible en Wi-Fi

> **Note** : `tcpip 5555` est réinitialisé à chaque redémarrage du casque. Il faut rebrancher en USB et recommencer si le casque est éteint.

### Étape 5 — Synchroniser des vidéos

1. Aller dans **Synchronisation**
2. Choisir la bibliothèque source (Location ou Animations)
3. Choisir le(s) casque(s) cible(s)
4. Cliquer **"Lancer (ADB réel)"**
5. Les logs apparaissent **ligne par ligne en temps réel** — tu vois la progression exacte de chaque fichier
6. Les fichiers `.mp4` sont copiés dans `/sdcard/Movies/VR-Ultimate/` sur le casque

### Étape 6 — Regarder sur le casque

1. Ouvrir **SkyBox VR Video Player** (télécharger gratuitement sur l'Oculus Store si pas déjà installé)
2. Onglet **"Local"** → les vidéos synchronisées apparaissent automatiquement
3. Cliquer → immersion 360° complète

---

## Pages de l'application

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/` | Vue d'ensemble : dernière sync, total vidéos, casques connectés |
| **Bibliothèques** | `/libraries` | Gérer les playlists et vidéos (ajouter, renommer, supprimer, preview 360°) |
| **Casques** | `/devices` | Voir/ajouter/supprimer les casques, connexion Wi-Fi, Préparer Wi-Fi (auto-IP) |
| **Synchronisation** | `/sync` | Lancer une sync ADB, logs SSE en temps réel ligne par ligne |
| **Statistiques** | `/stats` | Graphiques : formats, tailles, historique de sync |
| **Export** | `/export` | Générer un export JSON/CSV du catalogue |
| **Paramètres** | `/settings` | Chemin vidéo, URL serveur, ngrok, token, reset démo |

---

## Démo vs Réel

| Fonctionnalité | Mode démo (sans serveur) | Mode réel (avec serveur + ADB) |
|---|---|---|
| Affichage des casques | Données fictives dans le store | `adb devices -l` → vrais serials |
| Batterie & stockage | Valeurs fictives | `adb shell dumpsys battery` + `df /sdcard` |
| Statut connecté/déconnecté | Simulé aléatoirement | `adb get-state` en temps réel |
| Sync vidéos | Animation de progression simulée | `adb push` réel avec spawn + SSE |
| Logs de sync | Lignes simulées | Vraies lignes stdout d'adb push en temps réel |
| Progression (%) | Calculée sur durée estimée | Parsée depuis la sortie `[XX%]` d'adb |
| Skip si déjà présent | Toujours skip (simulé) | Comparaison taille locale vs distante |
| Preview vidéo | Message "démarrez le serveur" | Stream HTTP range avec le fichier réel |
| Player 360° | ❌ (non disponible sans serveur) | Canvas Three.js + OrbitControls |
| Gyroscope mobile (360°) | ❌ | DeviceOrientationEvent → rotation caméra |
| Préparer Wi-Fi | ❌ (bouton inactif) | `adb -s SERIAL tcpip 5555` |
| Auto-détection IP | ❌ | `adb shell ip addr show wlan0` → IP pré-remplie |
| Connexion Wi-Fi | ❌ (bouton désactivé) | `adb connect IP:5555` |

**Note** : En mode démo **avec** serveur (`npm run dev:all`), la preview vidéo utilise une vidéo 360° d'exemple en ligne (fallback) car les fichiers listés sont fictifs. Cela permet de tester le lecteur et le bouton 360° sans avoir de vrais fichiers.

---

## Ce qui reste à faire

### ✅ Déjà implémenté

- [x] Frontend React complet (7 pages, sidebar, design system)
- [x] Serveur Express avec tous les endpoints ADB
- [x] Proxy Vite `/api` → `:3001`
- [x] `npm run dev:all` (concurrently)
- [x] Support ngrok (URL publique dans les Paramètres)
- [x] Bouton "Préparer Wi-Fi" → `adb tcpip 5555`
- [x] Auto-détection IP après "Préparer Wi-Fi" → `adb shell ip addr show wlan0`
- [x] Bouton "Wi-Fi ADB" → `adb connect IP:PORT`
- [x] Refresh batterie/stockage depuis ADB (`/api/device-status/:serial`)
- [x] Streaming vidéo HTTP range pour preview
- [x] **Logs de sync en temps réel (SSE)** — spawn + EventSource
- [x] **Player 360° immersif** — Three.js sphere inversée + VideoTexture
- [x] **Gyroscope mobile** — DeviceOrientationEvent → rotation caméra + permission iOS

### 🔲 Reste à implémenter

#### A — Authentification serveur 🔒 (priorité moyenne)

**Problème** : N'importe qui sur le réseau local peut appeler `/api/sync` et déclencher des `adb push`.

**Solution** : Middleware Express qui vérifie un header `X-Auth-Token`

```js
// server/sync-server.js
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
app.use("/api", (req, res, next) => {
  if (!AUTH_TOKEN) return next(); // token vide = pas d'auth
  const token = req.headers["x-auth-token"];
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  next();
});
```

```ts
// src/lib/serverApi.ts — injecter le token dans les headers
headers: { "X-Auth-Token": settings.authToken ?? "" }
```

Le token se configure dans **Paramètres** → champ "Token d'authentification".

#### B — Notifications système (optionnel)

Envoyer une notification macOS/Linux quand la sync se termine via `node-notifier`.

```bash
npm install node-notifier
```

```js
// Après fin de sync dans sync-server.js
notifier.notify({ title: "VR Sync", message: `${count} fichiers synchronisés ✓` });
```

---

## Scripts npm

| Commande | Description |
|----------|-------------|
| `npm run dev` | Vite uniquement sur `:8080` (mode démo si pas de serveur) |
| `npm run dev:all` | Vite `:8080` + Express `:3001` en parallèle (recommandé) |
| `npm run build` | Compile le React dans `./dist/` |
| `npm start` | Express sert API + React depuis `:3001` (production) |
| `npm test` | Lance les tests Vitest |

---

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | `3001` | Port du serveur Express |
| `VIDEO_STORAGE_PATH` | `/videos/vr-ultimate` | Chemin local des fichiers MP4 |
| `AUTH_TOKEN` | _(vide)_ | Token d'auth pour les routes /api (désactivé si vide) |

Exemple :
```bash
VIDEO_STORAGE_PATH=/Users/toi/VR-Videos PORT=4000 npm start
```

---

## Troubleshooting

### Erreur `EADDRINUSE: address already in use :::3001`

Le serveur ne peut pas démarrer car un autre processus utilise déjà le port 3001. Souvent, c'est une ancienne instance de `npm run dev:all` ou de `node server/sync-server.js` qui tourne encore.

**Solution** : Libérer le port 3001 en arrêtant le processus qui l'utilise.

- **Linux / macOS** :
  ```bash
  lsof -i :3001
  # Note le PID (numéro de la 2e colonne), puis :
  kill <PID>
  ```
- **Windows (PowerShell ou CMD)** :
  ```powershell
  netstat -ano | findstr :3001
  # Note le PID (dernière colonne), puis :
  taskkill /PID <PID> /F
  ```

Ensuite, relancer `npm run dev:all`.

### `adb: command not found`
→ ADB n'est pas dans le PATH. Installer selon l'OS :
- **macOS** : `brew install android-platform-tools`
- **Linux (Debian/Ubuntu)** : `sudo apt install android-tools-adb`
- **Linux (Fedora)** : `sudo dnf install android-tools`
- **Windows** : Télécharger [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools), extraire et ajouter au PATH

Relancer le terminal après installation.

### `adb devices` retourne `unauthorized`
→ Le casque n'a pas autorisé le débogage.
1. Remettre le casque
2. Une popup "Autoriser le débogage USB ?" apparaît — cliquer **Autoriser**
3. Cocher "Toujours autoriser cet ordinateur" pour ne pas avoir à re-autoriser

### Badge serveur reste orange/rouge dans l'app
→ Le serveur Express ne tourne pas.
```bash
npm run dev:all
# ou
node server/sync-server.js
```
Vérifier que le port 3001 n'est pas déjà occupé (voir [Erreur EADDRINUSE](#erreur-eaddrinuse-address-already-in-use-3001) ci-dessus pour libérer le port — Linux/macOS : `lsof -i :3001` puis `kill <PID>` ; Windows : `netstat -ano | findstr :3001` puis `taskkill /PID <PID> /F`).

### "Détecter via ADB" affiche « Impossible de contacter le serveur ADB »
Ce message peut apparaître même si le badge affiche "SERVEUR CONNECTÉ". Cela signifie soit que le serveur est injoignable, soit qu'il a répondu une erreur (ex. ADB non installé).

**Solutions** :
1. S'assurer que `npm run dev:all` tourne **sans erreur** (pas de `EADDRINUSE` dans le terminal) — si le port 3001 est occupé par un ancien processus défaillant, le health check peut réussir mais les autres endpoints échouent. Libérer le port (voir EADDRINUSE ci-dessus) et relancer.
2. Vérifier qu'ADB est installé et dans le PATH : `adb version`
3. Brancher le casque en USB (ou le connecter en Wi-Fi ADB) avant de cliquer "Détecter via ADB"
4. Si le badge est vert et que tout semble correct : le problème vient probablement d'ADB (non installé ou casque non connecté)

### `Cannot find module 'express'`
→ `npm install` n'a pas été lancé, ou a échoué.
```bash
npm install
# puis
node server/sync-server.js
```

### Sync se lance mais aucun fichier transféré (tous "Skip")
→ Les fichiers MP4 n'existent pas dans le chemin configuré.
1. Aller dans **Paramètres** → vérifier "Chemin du stockage vidéo"
2. S'assurer que les fichiers `.mp4` existent à ce chemin
3. Vérifier que les noms correspondent exactement (casse, espaces, extension)

### Preview vidéo ne fonctionne pas
→ Normal si le serveur n'est pas lancé (mode démo).  
→ En mode réel, le fichier doit exister dans `VIDEO_STORAGE_PATH`.

### Le bouton 360° n'apparaît pas
→ Il n'est visible que si le serveur est connecté **ET** que la vidéo a fini de charger (état "Prêt").  
→ Vérifier que le fichier `.mp4` existe côté serveur.

### Gyroscope ne fonctionne pas sur iPhone/iPad
→ iOS 13+ requiert une permission explicite.  
→ Cliquer le bouton "Gyro" déclenche une popup système — cliquer **Autoriser**.  
→ Si la popup n'apparaît pas, vérifier dans iOS Paramètres → Safari → Accès aux capteurs de mouvement.

### Auto-détection IP ne trouve rien
→ Le casque doit être connecté au Wi-Fi **ET** branché en USB au moment du clic "Préparer Wi-Fi".  
→ Si l'IP est `null` dans la réponse, le casque n'est peut-être pas connecté au Wi-Fi — vérifier dans le casque : Paramètres → Wi-Fi.

### Wi-Fi ADB : "adb connect" réussit mais le casque ne répond plus après redémarrage
→ `tcpip 5555` est réinitialisé à chaque redémarrage du casque. Rebrancher en USB et refaire "Préparer Wi-Fi".

### `ngrok: command not found`
→ Installer selon l'OS :
- **macOS** : `brew install ngrok/ngrok/ngrok`
- **Linux / Windows** : télécharger depuis [ngrok.com/download](https://ngrok.com/download)
- **Windows** : ou `winget install ngrok`

### Les logs SSE ne s'affichent pas en temps réel
→ Vérifier que le serveur tourne en mode `dev:all` (pas juste `dev`).  
→ En production via ngrok, vérifier que les headers SSE passent bien (certains proxys bufferisent les chunks).

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Styling | Tailwind CSS + CSS Variables (design system) |
| État global | Zustand 5 (persist → localStorage) |
| Routing | React Router 6 |
| Graphiques | Recharts |
| UI components | shadcn/ui (Radix UI) |
| Notifications | Sonner |
| Player 360° | @react-three/fiber + @react-three/drei + Three.js |
| Backend | Express 4 (Node.js) |
| ADB bridge | `child_process.spawn` + `execSync` |
| Streaming temps réel | Server-Sent Events (SSE) |
| Lancement parallèle | concurrently |
| Tests | Vitest + Testing Library |
| E2E | Playwright |
