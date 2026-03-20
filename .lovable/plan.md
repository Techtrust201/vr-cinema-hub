
## Ce qui se passe et comment passer en mode réel

### Diagnostic des erreurs `/api/health` 500

Les logs réseau montrent que `/api/health` retourne **500 toutes les 15 secondes** depuis le preview Lovable. C'est normal et attendu : le preview est hébergé sur `https://lovableproject.com`, et la requête `/api/health` est envoyée vers ce même serveur Lovable qui ne connaît pas cette route — d'où le 500. Ce n'est pas un bug de l'app.

Le proxy Vite ne fonctionne que quand tu lances `npm run dev` **sur ton ordinateur local**. En preview Lovable, il n'y a pas de proxy.

---

### Ce qu'il faut faire pour tester en mode réel — 3 étapes

```text
Ton ordinateur (Mac/Linux/Windows)
├── Terminal 1 : npm run dev          → Vite sur :8080 avec proxy
│                                        /api/* → http://localhost:3001
└── Terminal 2 : npm run dev:server   → Express + ADB sur :3001
```

**Étape 1 — Récupérer le projet Lovable en local**
```bash
# Depuis GitHub (bouton Export dans Lovable) :
git clone https://github.com/TON_REPO/vr-ultimate
cd vr-ultimate
npm install
```

**Étape 2 — Installer les dépendances du serveur Express**
```bash
npm run setup:server
# ou manuellement :
cd server && npm init -y && npm install express cors
```

**Étape 3 — Lancer les deux processus**
```bash
# Terminal 1 :
npm run dev

# Terminal 2 :
npm run dev:server
# (ou: node server/sync-server.js)
```

Ensuite ouvrir `http://localhost:8080` → le badge "Mode démo" devient **"Serveur connecté"**.

---

### Comment le switch Mode démo → Mode réel fonctionne

| Composant | Mode démo (preview Lovable) | Mode réel (local + serveur) |
|---|---|---|
| Badge header | "Mode démo" orange | "Serveur connecté" vert |
| Bouton "Détecter via ADB" | Désactivé (grisé) | Actif — appelle `adb devices` |
| Lecture vidéo | Placeholder animé | HTML5 `<video>` depuis `/api/video/` |
| Bouton Sync | Simulation avec logs fictifs | Vrais `adb push` avec logs réels |

Le switch est **automatique** : `checkServer()` est appelé toutes les 15s dans le layout + au montage de chaque page. Dès que le serveur répond sur `/api/health`, l'app bascule en mode réel sans aucune action manuelle.

---

### Pour tester la lecture vidéo

Mettre les vrais fichiers MP4 dans le dossier configuré dans Paramètres (par défaut `/videos/vr-ultimate`) et démarrer le serveur avec :

```bash
VIDEO_STORAGE_PATH=/chemin/vers/mes/videos npm run dev:server
```

Le nom du fichier dans la bibliothèque doit correspondre exactement au nom du fichier sur disque (ex : `Notre-Dame_Reconstruction_360_4K.mp4`).

---

### Amélioration à apporter : supprimer le polling inutile en preview

Le badge poll toutes les 15s → en preview Lovable, ça génère des 500 en boucle. Il faut ajouter une condition : si on est sur un hostname Lovable (`.lovable.app`), ne pas lancer le polling automatique.

**Fichier à modifier : `src/components/dashboard/DashboardLayout.tsx`**

Dans `ServerModeBadge`, avant de lancer le polling, vérifier :
```ts
const isLovablePreview = window.location.hostname.includes("lovable.app") 
  || window.location.hostname.includes("lovableproject.com");
```
Si vrai → afficher directement "Mode démo" sans appeler `checkServer` ni lancer l'interval.

Même chose dans `src/pages/Settings.tsx` — l'auto-check au montage.

**Fichiers à modifier :**
1. `src/components/dashboard/DashboardLayout.tsx` — `ServerModeBadge` : skip le polling en preview Lovable
2. `src/pages/Settings.tsx` — skip le `handleTestServer` auto au montage si en preview Lovable
3. `src/lib/serverApi.ts` — optionnel : exporter un helper `isLovablePreview()` réutilisable
