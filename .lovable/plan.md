
## Comprendre la demande : "mono fichier back et front"

L'utilisateur veut une solution tout-en-un qui marche vraiment en local. Le problème actuel : le preview Lovable est en HTTPS et les appels vers `http://localhost:3001` sont bloqués (mixed content). Quand il lance le projet en local avec `npm run dev`, ça marchera — mais seulement si le frontend passe par un proxy Vite (URL relative `/api/...`) plutôt qu'une URL absolue `http://localhost:3001`.

### La vraie solution : Proxy Vite + URLs relatives

Au lieu de `http://localhost:3001/health`, le frontend appelle `/api/health`.
- En dev local : Vite proxy `/api` → `http://localhost:3001` — plus de problème mixed content
- En prod : le même Express sert le build React ET l'API sur le même port

### Plan d'implémentation

**1. `vite.config.ts`** — ajouter le proxy en mode dev:
```
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, '')
    }
  }
}
```

**2. `src/lib/serverApi.ts`** — changer toutes les URLs absolues en relatives:
- `checkServer`: ignore le `serverUrl` passé, appelle `/api/health`
- `fetchServerDevices`: appelle `/api/devices`
- `pushSync`: appelle `/api/sync`
- `getVideoUrl`: retourne `/api/video/{name}`
- Garder `serverUrl` en param pour compatibilité mais l'ignorer (le proxy gère)

**3. `server/sync-server.js`** — transformer en serveur full-stack:
- Ajouter `path` import pour résoudre le dossier `dist/`
- Après le build (`npm run build`), servir `dist/` comme fichiers statiques: `app.use(express.static(path.join(__dirname, '../dist')))`
- Catch-all route `app.get('*', ...)` qui sert `dist/index.html` pour le routing React
- Ajouter `"start": "node server/sync-server.js"` dans les scripts

**4. `package.json`** — ajouter les scripts utiles:
```json
"start": "node server/sync-server.js",
"dev:server": "node server/sync-server.js",
"setup": "cd server && npm install"
```

**5. `src/pages/Settings.tsx`** — mettre à jour le guide de démarrage:
- Simplifier les instructions : `npm install && npm run build && npm start`
- Afficher l'URL de l'app: `http://localhost:3001`
- Supprimer la référence à `cd server && npm init`

**6. `src/store/vrStore.ts`** — changer `serverUrl` par défaut:
- `serverUrl: "http://localhost:3001"` → garder mais dans le composant Settings on explique que le proxy gère automatiquement

### Comment ça fonctionnera en local

```text
npm run build          # compile le React dans dist/
npm start              # lance Express sur :3001
                       # → sert l'app React sur http://localhost:3001
                       # → API ADB sur http://localhost:3001/api/*
                       # → vidéos sur http://localhost:3001/api/video/*

# En développement (hot reload):
npm run dev            # Vite sur :8080 avec proxy → :3001
node server/sync-server.js  # Express sur :3001
```

### Pourquoi ça résout le problème

| Avant | Après |
|---|---|
| Frontend (HTTPS Lovable) → `http://localhost:3001` = bloqué | Frontend (local) → `/api/*` = même origine |
| Deux processus à lancer séparément | `npm start` = tout fonctionne |
| Preview Lovable = mode simulation forcé | Preview Lovable = simulation, local = réel |

### Fichiers à modifier

1. `vite.config.ts` — proxy `/api` → `http://localhost:3001`
2. `src/lib/serverApi.ts` — URLs relatives `/api/...`
3. `server/sync-server.js` — servir `dist/` + catch-all React router
4. `package.json` — scripts `start`, `dev:server`
5. `src/pages/Settings.tsx` — mettre à jour le guide de démarrage
