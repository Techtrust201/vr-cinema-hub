## Audit complet A→Z — Ce qui fonctionne, ce qui manque, roadmap complète

### Ce que j'ai analysé

- `server/sync-server.js` — backend Express complet
- `src/lib/serverApi.ts` — bridge frontend↔backend
- `src/store/vrStore.ts` — état global (Zustand + persist)
- `src/pages/` — toutes les pages (Index, Libraries, Devices, Sync, Settings, Stats, Export)
- `src/components/dashboard/` — VideoPreviewModal, DeviceCard, DashboardLayout
- `vite.config.ts` + `package.json` — setup proxy et scripts

---

## ÉTAT ACTUEL — Ce qui est déjà câblé

**Frontend** : Dashboard complet avec sidebar, 7 pages, données de démo réalistes, mode démo/réel automatique, badge serveur, notifications.

**Backend** : Serveur Express Node.js avec 5 endpoints : `/api/health`, `/api/devices`, `/api/sync`, `/api/video/:name`, catch-all React.

**Connecteurs câblés** :

- `checkServer` → `/api/health` — ✅ avec skip intelligent en preview Lovable
- `fetchServerDevices` → `/api/devices` — ✅ ADB detect dans Devices.tsx
- `pushSync` → `/api/sync` — ✅ mode réel dans Sync.tsx avec fallback simulation
- `getVideoUrl` → `/api/video/:name` — ✅ HTML5 player dans VideoPreviewModal
- Proxy Vite `/api` → `http://localhost:3001` — ✅ configuré

---

## CE QUI MANQUE — Classé par priorité

### NIVEAU 1 — Prérequis physiques (hors code, à faire toi-même)

1. **ADB installé** — Android Platform Tools : `brew install android-platform-tools` (Mac) ou [https://developer.android.com/tools/releases/platform-tools](https://developer.android.com/tools/releases/platform-tools)
2. **Mode développeur Meta Quest activé** :
  - Créer compte Meta Developer (gratuit) sur developer.oculus.com
  - Sur le casque : Paramètres → Système → Développeur → Activer Mode USB
  - Accepter la popup "Autoriser le débogage" sur le casque quand tu branches le câble
3. **Câble USB de qualité** — câble data (pas juste charge). Test : `adb devices` doit retourner le serial.
4. **Fichiers vidéo MP4** dans `/videos/vr-ultimate/` (ou chemin configuré dans Paramètres). Les noms de fichiers doivent correspondre exactement à ceux dans la bibliothèque (`Notre-Dame_Reconstruction_360_4K.mp4` etc.)

### NIVEAU 2 — Ce qui manque dans le code

**A. Dépendances serveur non installées**

- `server/package.json` n'existe pas encore — `npm run setup:server` crée un package.json dans `/server` et installe `express` + `cors`. Ce script est dans `package.json` mais il faut le lancer une fois.

**B. Pas de `server/package.json` livré**

- Le script `npm run setup:server` génère un `package.json` dans `/server/` avec `npm init -y`, mais ça ne sera pas inclus dans le repo Git. Il faudrait soit livrer un `server/package.json` figé, soit passer à une solution `require('express')` avec le dossier `node_modules` à la racine (puisque le `package.json` racine n'a pas express en dépendance non plus).

**Solution propre** : Ajouter `express` et `cors` dans les dépendances du `package.json` racine (pas juste dans server/). `server/sync-server.js` fait `require('express')` donc Node cherchera dans `node_modules/` à la racine — ça marcherait directement après `npm install`.

**C. Streaming vidéo manquant pour certains formats**

- La modale preview essaie de lire `/api/video/:name` mais le serveur sert le fichier brut. Pour les fichiers `.mp4` 360° dans Skybox/un vrai player VR, ça marche. Mais dans le navigateur desktop, une vidéo 360° s'affiche comme une vidéo "plate" — c'est normal, c'est un aperçu bureau.

**D. Connexion Wi-Fi ADB pas gérée dans le serveur**

- `adb devices` ne retourne que les appareils déjà connectés (USB ou Wi-Fi). Si un casque est en Wi-Fi, il faut d'abord faire `adb connect 192.168.1.101:5555`. Le serveur n'a pas de route `/api/connect` pour initier une connexion Wi-Fi.

**E. Statut des appareils non synchronisé avec l'ADB réel**

- Dans le store, le `status: "connected"` des casques est fictif (mis manuellement ou via la démo). Aucun endpoint ne lit le vrai état ADB pour mettre à jour le store. Le bouton "Détecter via ADB" détecte et ajoute, mais ne met pas à jour `status` des casques existants.

**F. Pas de route `/api/connect` pour Wi-Fi ADB**

- Manquant dans `sync-server.js` : `POST /api/connect { ip, port }` qui fait `adb connect IP:PORT` et retourne le résultat.

**G. Taille de stockage et batterie non lues depuis ADB**

- Le serveur pourrait lire la batterie (`adb shell dumpsys battery`) et l'espace disque (`adb shell df /sdcard`) mais ces infos ne sont pas récupérées. Les valeurs dans le store sont fictives.

### NIVEAU 3 — Améliorations pour l'usage réel en production

**H. Pas de gestion d'erreur si `adb` n'est pas dans le PATH**

- Le serveur fait `execSync("adb devices")` — si ADB n'est pas installé, ça crashe avec une erreur peu claire.

**I. Sync bloquante (pas de streaming de logs)**

- Quand `adb push` tourne sur un fichier de 5 GB, le serveur attend que `execSync` se termine → timeout possible, pas de logs en temps réel. Idéalement : `spawn` au lieu de `execSync` avec un endpoint SSE `/api/sync/stream`.

**J. Pas d'authentification sur les routes API**

- N'importe qui sur le réseau local peut appeler `/api/sync` et déclencher des `adb push`. Le `authToken` dans les settings n'est pas vérifié côté serveur.

---

## ROADMAP — Ce que je propose d'implémenter

### Sprint immédiat (à coder maintenant) — 3 changements critiques

**1. Ajouter `express` et `cors` dans les dépendances racine du `package.json**`  
→ `npm install` suffit, plus besoin de `setup:server`

**2. Ajouter `POST /api/connect` dans le serveur**  
→ Permet de connecter un casque en Wi-Fi directement depuis l'interface  
→ Bouton "Connecter en Wi-Fi" dans DeviceCard

**3. Ajouter `GET /api/device-status/:serial` dans le serveur**  
→ Lit batterie + stockage depuis ADB  
→ Met à jour le store en temps réel quand le serveur est connecté  
→ Bouton "Rafraîchir" dans Devices.tsx appelle cet endpoint

### Sprint suivant (pour plus tard)

**4. Logs de sync en temps réel (SSE / spawn)**  
→ Voir les lignes apparaître une par une pendant le `adb push`

**5. Auth token côté serveur**  
→ Middleware Express qui vérifie un header `X-Auth-Token`

---

## RÉSUMÉ VISUEL — Ce qu'il faut faire pour que tout marche

```text
MACHINE LOCALE
│
├── 1. PRÉREQUIS PHYSIQUES (toi)
│   ├── ADB installé (brew install android-platform-tools)
│   ├── Mode dev activé sur le casque Meta Quest
│   ├── Câble USB branché + débogage autorisé
│   └── Fichiers MP4 dans /videos/vr-ultimate/
│
├── 2. INSTALLATION (une fois)
│   ├── git clone + npm install
│   └── (après fix) express + cors dans package.json → déjà inclus
│
├── 3. LANCEMENT
│   ├── Terminal 1 : npm run dev    → http://localhost:8080
│   └── Terminal 2 : npm run dev:server → Express :3001
│       OU
│       npm run build && npm start  → tout sur :3001
│
└── 4. TEST
    ├── Paramètres → "Tester" → badge passe vert "Serveur connecté"
    ├── Casques → "Détecter via ADB" → casques apparaissent
    ├── Sync → "Lancer (ADB réel)" → vrais logs adb push
    └── Bibliothèques → preview vidéo → lecture HTML5 réelle
```

### Fichiers à modifier maintenant

1. `**package.json**` — ajouter `express` et `cors` en `dependencies` (+ supprimer le script `setup:server` devenu inutile)
2. `**server/sync-server.js**` — ajouter `POST /api/connect` (Wi-Fi ADB) + `GET /api/device-status/:serial` (batterie + stockage depuis ADB)
3. `**src/lib/serverApi.ts**` — ajouter `connectDevice(ip, port)` et `fetchDeviceStatus(serial)`
4. `**src/pages/Devices.tsx**` — bouton "Connecter Wi-Fi" dans DeviceCard + refresh réel depuis ADB status  
  
  
  
et ensuite une fois que tu as fait tous ca dis moi tous ce quil me reste à faire pour que tous fonctionne reellement genre qu je puisse vraiment tous relier les casques etc... lire en 180 ou 360 enfin analyse tous de AaZ et dis moi tous ce quil manque pour pouvoir repondre à la web application de mes reves