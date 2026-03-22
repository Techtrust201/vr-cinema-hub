
## 3 fonctionnalités à implémenter

### A. Mode Démo / Mode Réel — toggle dans Paramètres

**Store (`vrStore.ts`)** : ajouter `demoMode: boolean` dans `VRSettings` avec valeur par défaut `true`. Ajouter `demoMode` dans `isDirty` dans Settings.

**Settings.tsx** : ajouter une section "Mode de fonctionnement" avec un Switch Radix UI (déjà installé) + label explicatif :
- **Mode Démo** (ON) → données fictives, pas de serveur requis, simulation partout
- **Mode Réel** (OFF) → ADB live, serveur requis, toutes les données viennent du casque réel

**Impact dans le reste de l'app** : le `demoMode` est déjà partiellement géré (les pages vérifient `serverStatus === "connected"`). Avec ce toggle, on court-circuite : si `demoMode = true` → on n'essaie jamais de contacter le serveur, on reste en simulation. Si `demoMode = false` → comportement actuel (serveur requis).

Modifier `Devices.tsx` et `Sync.tsx` pour lire `settings.demoMode` directement depuis le store pour décider du mode (au lieu de checker `serverStatus` uniquement).

---

### B. Middleware Auth Token — serveur Express

**`server/sync-server.js`** :
1. Lire le token attendu depuis `process.env.VR_AUTH_TOKEN`
2. Middleware Express sur les routes sensibles : `/api/sync/*`, `/api/connect`, `/api/tcpip/*`, `/api/device-ip/*`, `/api/device-status/*`
3. Si `VR_AUTH_TOKEN` est vide/absent → middleware désactivé (rétrocompatibilité)
4. Si présent → vérifie `req.headers['x-auth-token'] === process.env.VR_AUTH_TOKEN`, sinon `401`

**`src/lib/serverApi.ts`** : modifier `apiBase()` pour accepter un token en option et ajouter un header `X-Auth-Token` dans toutes les requêtes `fetch`. Créer une fonction helper `apiFetch(url, opts, token?)` qui injecte le header si le token est fourni.

**Impact** : toutes les fonctions (`checkServer`, `fetchServerDevices`, `pushSync`, etc.) acceptent un `token?` en paramètre. Dans les pages qui appellent ces fonctions, passer `settings.authToken` quand disponible.

---

### C. Notifications système (node-notifier)

**`package.json`** : ajouter `"node-notifier": "^10.0.1"` dans `dependencies`.

**`server/sync-server.js`** :
- `require('node-notifier')` avec `try/catch` (silencieux si non dispo)
- Dans `jobDone()` : envoyer une notification système après chaque sync terminée
  ```js
  notifier.notify({
    title: "VR Ultimate — Sync terminée",
    message: `${summary.pushed} fichier(s) envoyé(s), ${summary.errors} erreur(s)`,
    icon: path.join(__dirname, "../public/placeholder.svg"),
  });
  ```
- Fallback silencieux si `node-notifier` n'est pas installé (try/catch autour du require)

---

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/store/vrStore.ts` | + `demoMode: boolean` dans `VRSettings` (défaut `true`) |
| `src/pages/Settings.tsx` | + section "Mode" avec Switch démo/réel + `demoMode` dans isDirty |
| `src/lib/serverApi.ts` | + `apiFetch` helper qui injecte `X-Auth-Token` dans tous les appels |
| `server/sync-server.js` | + middleware auth token + require node-notifier + notification dans jobDone |
| `package.json` | + `node-notifier` |
| `src/pages/Devices.tsx` | + lecture `settings.demoMode` pour forcer le mode démo sans contacter le serveur |
| `src/pages/Sync.tsx` | + lecture `settings.demoMode` pour forcer le mode démo |
