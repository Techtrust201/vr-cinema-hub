# 🎬 VR Ultimate Dashboard

Dashboard de gestion de contenu VR pour casques Meta Quest — synchronisation de vidéos 360°/180° via ADB, gestion de bibliothèques, suivi des appareils.

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Structure des fichiers](#structure-des-fichiers)
4. [Prérequis](#prérequis)
5. [Installation](#installation)
6. [3 modes de fonctionnement](#3-modes-de-fonctionnement)
7. [Guide connexion Meta Quest](#guide-connexion-meta-quest)
8. [Pages de l'application](#pages-de-lapplication)
9. [Démo vs Réel — ce qui est simulé vs câblé](#démo-vs-réel)
10. [Ce qui reste à faire](#ce-qui-reste-à-faire)
11. [Troubleshooting](#troubleshooting)

---

## Vue d'ensemble

VR Ultimate Dashboard est une application **fullstack locale** composée de :

- **Frontend React** — dashboard web avec 7 pages, données persistées dans le navigateur
- **Backend Express** — serveur Node.js local qui exécute les commandes `adb` (Android Debug Bridge)

L'application gère :
- 📚 **Bibliothèques** de vidéos VR (360° et 180°, stéréo SBS/OU/Mono) organisées en playlists
- 🥽 **Casques Meta Quest** — connexion USB et Wi-Fi ADB, suivi batterie/stockage
- 🔄 **Synchronisation** — push `adb` des vidéos vers les casques
- 📊 **Statistiques** — usage, formats, distribution
- 📤 **Export** — manifeste JSON/CSV des bibliothèques

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TON ORDINATEUR (macOS/Linux)                    │
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
│  │  Zustand (persist)       │     │  POST /api/connect            │  │
│  │  ↕ localStorage          │     │  POST /api/tcpip/:serial      │  │
│  └─────────────────────────┘     │  POST /api/sync               │  │
│                                   │  GET  /api/video/:name        │  │
│  Proxy Vite :                     │                               │  │
│  /api/* → :3001                   │  ↕ child_process.execSync()   │  │
│  (développement uniquement)        └──────────────┬───────────────┘  │
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

### Flux de données

```
Utilisateur clique "Sync"
  → Sync.tsx appelle pushSync() dans serverApi.ts
    → fetch POST /api/sync (proxy Vite → Express :3001)
      → sync-server.js : execSync("adb -s SERIAL push fichier.mp4 /sdcard/...")
        → Fichier transféré sur le casque
          → Résultat JSON retourné au frontend
            → SyncLog mis à jour dans le store Zustand
              → UI mise à jour en temps réel
```

---

## Structure des fichiers

```
vr-ultimate/
│
├── server/
│   └── sync-server.js          ← Serveur Express + toutes les routes ADB
│
├── src/
│   ├── lib/
│   │   └── serverApi.ts        ← Bridge fetch() frontend ↔ backend
│   │
│   ├── store/
│   │   └── vrStore.ts          ← État global Zustand (persist localStorage)
│   │
│   ├── pages/
│   │   ├── Index.tsx           ← Dashboard principal (stats, dernière sync)
│   │   ├── Libraries.tsx       ← Gestion des bibliothèques et playlists
│   │   ├── Devices.tsx         ← Casques ADB (USB + Wi-Fi)
│   │   ├── Sync.tsx            ← Lancer une synchronisation
│   │   ├── Stats.tsx           ← Statistiques & graphiques
│   │   ├── Export.tsx          ← Export JSON/CSV
│   │   └── Settings.tsx        ← Configuration serveur, chemins, token
│   │
│   └── components/
│       └── dashboard/
│           ├── DashboardLayout.tsx   ← Sidebar + badge serveur
│           ├── DeviceCard.tsx        ← Carte casque (batterie, stockage, Wi-Fi)
│           ├── VideoRow.tsx          ← Ligne vidéo dans une playlist
│           ├── VideoPreviewModal.tsx ← Player HTML5 pour aperçu vidéo
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
```bash
# macOS (avec Homebrew)
brew install android-platform-tools

# Vérification
adb version
# → Android Debug Bridge version 1.0.41
```
Ou télécharger manuellement : https://developer.android.com/tools/releases/platform-tools

#### 3. Un casque Meta Quest (2, 3 ou Pro)
- Mode développeur **activé** sur le casque (voir guide ci-dessous)
- Un câble USB **data** (pas juste charge) — tester avec `adb devices` après branchement

### Fichiers vidéo

Les vidéos doivent être présentes **localement** sur ta machine dans le chemin configuré dans les Paramètres (défaut : `/videos/vr-ultimate/`).

Les noms de fichiers dans l'app doivent correspondre **exactement** aux fichiers sur disque :
```
/videos/vr-ultimate/
├── Notre-Dame_Reconstruction_360_4K.mp4
├── Notre-Dame_Exterieur_360_4K.mp4
├── NYC_TimesSquare_360_SBS_Day.mp4
├── EscapeRoom_VR_180_SBS_8K.mp4
└── ...
```

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

### Mode 1 — Démo (aucun serveur, aucun casque)

Aucune configuration requise. Le frontend fonctionne avec des données simulées dans le store Zustand. La synchronisation est **simulée** (pas d'ADB réel). Parfait pour explorer l'interface.

```bash
# Juste le frontend
npm run dev
# → http://localhost:8080 avec données de démo
```

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
brew install ngrok/ngrok/ngrok   # ou https://ngrok.com/download
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

### Étape 4 — Passer en Wi-Fi (optionnel mais recommandé)

Le Wi-Fi permet de synchoniser **sans câble** tant que le casque est sur le même réseau.

1. Brancher le casque en USB (étapes 1-3 faites)
2. Dans **Casques** → survoler la carte du casque → cliquer **"Préparer Wi-Fi"**
   - L'app envoie automatiquement `adb tcpip 5555` au serveur
   - Toast de confirmation : "Casque prêt — débranchez le câble"
3. Débrancher le câble USB
4. Cliquer **"Wi-Fi ADB"** dans la barre en haut de la page Casques
5. Entrer l'adresse IP du casque (visible dans Paramètres → À propos → Connexion Wi-Fi)
6. Cliquer "Connecter" → le casque est maintenant accessible sans fil

> **Note** : Si le casque se déconnecte du Wi-Fi ou redémarre, répéter depuis l'étape 1 (rebrancher USB pour réinitialiser tcpip).

### Étape 5 — Synchroniser des vidéos

1. Aller dans **Synchronisation**
2. Choisir la bibliothèque source (Location ou Animations)
3. Choisir le(s) casque(s) cible(s)
4. Cliquer **"Lancer (ADB réel)"**
5. Les fichiers `.mp4` sont copiés dans `/sdcard/Movies/VR-Ultimate/` sur le casque

---

## Pages de l'application

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/` | Vue d'ensemble : dernière sync, total vidéos, casques connectés |
| **Bibliothèques** | `/libraries` | Gérer les playlists et vidéos (ajouter, renommer, supprimer, preview) |
| **Casques** | `/devices` | Voir/ajouter/supprimer les casques, connexion Wi-Fi, bouton Préparer Wi-Fi |
| **Synchronisation** | `/sync` | Lancer une sync ADB ou simulée, voir les logs en direct |
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
| Sync vidéos | Animation de progression simulée | `adb push` réel fichier par fichier |
| Skip si déjà présent | Toujours skip (simulé) | Comparaison taille locale vs distante |
| Preview vidéo | Tentative de lecture `/api/video/:name` | Stream HTTP range avec le fichier réel |
| Préparer Wi-Fi | ❌ (bouton inactif) | `adb -s SERIAL tcpip 5555` |
| Connexion Wi-Fi | ❌ (bouton désactivé) | `adb connect IP:5555` |

---

## Ce qui reste à faire

### ✅ Déjà fait
- [x] Frontend React complet (7 pages, sidebar, design system)
- [x] Serveur Express avec 7 endpoints ADB
- [x] Proxy Vite `/api` → `:3001`
- [x] `npm run dev:all` (concurrently)
- [x] Support ngrok (URL publique dans les Paramètres)
- [x] Bouton "Préparer Wi-Fi" → `adb tcpip 5555`
- [x] Bouton "Wi-Fi ADB" → `adb connect IP:PORT`
- [x] Refresh batterie/stockage depuis ADB (`/api/device-status/:serial`)
- [x] Streaming vidéo HTTP range pour preview

### 🔲 Reste à implémenter (par priorité)

#### A — Logs de sync en temps réel ⚡ (priorité haute)

**Problème actuel** : `handleSync` dans `sync-server.js` utilise `execSync` → le serveur bloque jusqu'à la fin du push. Pour un fichier de 8 GB, ça peut prendre 10 minutes sans retour.

**Solution** : Remplacer `execSync` par `spawn` + Server-Sent Events (SSE)

```js
// server/sync-server.js
app.get("/api/sync/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  const { serial, file } = req.query;
  const proc = spawn("adb", ["-s", serial, "push", file, "/sdcard/Movies/VR-Ultimate/"]);
  proc.stdout.on("data", (d) => res.write(`data: ${d.toString()}\n\n`));
  proc.on("close", () => res.write("data: [DONE]\n\n"));
});
```

```ts
// src/pages/Sync.tsx — côté client
const es = new EventSource(`/api/sync/stream?serial=${serial}&file=${name}`);
es.onmessage = (e) => appendLine(e.data);
```

#### B — Authentification serveur 🔒 (priorité moyenne)

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
// src/lib/serverApi.ts — injecter le token
headers: { "X-Auth-Token": authToken ?? "" }
```

#### C — Player 360°/180° immersif 🌐 (priorité basse)

**Problème actuel** : Le `VideoPreviewModal` utilise `<video>` HTML5 natif → les vidéos 360° s'affichent "plates" (projection équirectangulaire non traitée).

**Solution** : Intégrer un player VR web comme [A-Frame](https://aframe.io) ou le plugin VR de [Video.js](https://github.com/nicholasgasior/vjs-plugin-vr)

```bash
npm install aframe
```

```tsx
// Composant VideoPreviewModal amélioré
<a-scene>
  <a-videosphere src="#video360" rotation="0 -90 0" />
  <a-video id="video360" src="/api/video/filename.mp4" />
</a-scene>
```

> Cet aperçu reste un bonus — les vidéos sont lues correctement dans le casque via SkyBox Player ou le gestionnaire natif Quest.

#### D — Détection automatique de l'IP du casque 📶

**Problème** : Pour la connexion Wi-Fi, l'utilisateur doit trouver l'IP manuellement dans le casque.

**Solution** : Lire l'IP directement depuis ADB pendant que le casque est en USB

```js
// server/sync-server.js
app.get("/api/device-ip/:serial", (req, res) => {
  const out = execSync(`adb -s ${req.params.serial} shell ip route`, { encoding: "utf8" });
  const match = out.match(/src\s+([\d.]+)/);
  res.json({ ip: match?.[1] ?? null });
});
```

#### E — Notifications système (optionnel)

Envoyer une notification macOS/Linux quand la sync se termine via `node-notifier`.

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

### `adb: command not found`
→ ADB n'est pas dans le PATH.
```bash
brew install android-platform-tools
# puis relancer le terminal
```

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
Vérifier que `:3001` n'est pas utilisé par un autre process : `lsof -i :3001`

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
→ La vidéo s'affiche "plate" dans le navigateur : c'est normal pour les vidéos 360° (voir section "Player 360° immersif" dans la roadmap).

### Wi-Fi ADB : "adb connect" réussit mais le casque ne répond plus après redémarrage
→ `tcpip 5555` est réinitialisé à chaque redémarrage du casque. Il faut rebrancher en USB et refaire "Préparer Wi-Fi" à chaque fois.

### `ngrok: command not found`
```bash
brew install ngrok/ngrok/ngrok
# ou télécharger depuis https://ngrok.com/download
```

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
| Backend | Express 4 (Node.js) |
| ADB bridge | `child_process.execSync` |
| Lancement parallèle | concurrently |
| Tests | Vitest + Testing Library |
| E2E | Playwright |
