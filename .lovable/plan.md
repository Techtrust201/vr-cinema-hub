
## Ce que l'utilisateur demande

Il veut une seule commande (`npm run dev` ou `npm start`) qui lance **les deux** — Vite (frontend) + Express (backend) — en même temps, pour tout tester en live.

## Pourquoi le preview Lovable ne peut pas atteindre un serveur local

Problème fondamental : le preview Lovable tourne sur `https://id-preview--xxx.lovable.app`. Quand le frontend appelle `/api/health`, c'est une requête relative → elle va sur les serveurs Lovable, pas ton ordinateur. Même avec `concurrently`, le serveur Express tourne sur **ton** laptop, pas sur les serveurs Lovable.

Il y a deux vraies solutions :

| Option | Comment | Complexité |
|---|---|---|
| **A — `concurrently` local** | Un seul `npm run dev` lance Vite + Express en parallèle sur ton ordi | Facile — 1 fichier |
| **B — Exposer via tunnel ngrok** | ngrok expose `localhost:3001` sur une URL publique HTTPS, Lovable peut l'appeler | Moyen — nécessite ngrok installé |

**Choix recommandé** : faire les DEUX. `concurrently` pour le confort local, et dans les Settings ajouter un champ "URL serveur public" qui permet de coller une URL ngrok quand on veut tester depuis le preview Lovable.

---

## Plan d'implémentation

### 1. `package.json` — ajouter `concurrently` + script `dev:all`

Ajouter en devDependencies :
```json
"concurrently": "^8.2.0"
```

Ajouter le script :
```json
"dev:all": "concurrently -n \"VITE,SERVER\" -c \"cyan,yellow\" \"vite\" \"node server/sync-server.js\""
```

Résultat : `npm run dev:all` lance les deux avec des logs colorés et préfixés.

### 2. `src/lib/serverApi.ts` — support URL publique (ngrok)

Modifier `checkServer`, `fetchServerDevices`, `pushSync`, `getVideoUrl`, `connectDevice`, `fetchDeviceStatus` pour accepter une `baseUrl` optionnelle :
- Si `baseUrl` est vide → utilise `/api/...` (proxy local, comme aujourd'hui)
- Si `baseUrl` est rempli (ex: `https://abc123.ngrok.io`) → utilise `${baseUrl}/api/...`

### 3. `src/store/vrStore.ts` — ajouter `publicServerUrl`

Ajouter un champ `publicServerUrl: ""` dans le store pour stocker l'URL ngrok.

### 4. `src/pages/Settings.tsx` — champ URL publique + guide ngrok

Ajouter dans la section serveur :
- Input "URL serveur public (optionnel)" avec placeholder `https://xxxx.ngrok.io`
- Guide en 3 étapes : installer ngrok → `ngrok http 3001` → coller l'URL

### 5. `src/components/dashboard/DashboardLayout.tsx` — passer `publicServerUrl` à `checkServer`

Le badge ServerModeBadge lit `publicServerUrl` du store et l'utilise si disponible.

---

## Résumé visual

```text
LOCAL (ton ordi)
  npm run dev:all
  ├── Vite :8080  (hot reload React)
  └── Express :3001  (ADB API)
  → Ouvre http://localhost:8080 → tout marche

PREVIEW LOVABLE (leurs serveurs)
  → /api/health → serveurs Lovable → 500 (normal, skip)
  
PREVIEW LOVABLE + NGROK
  ngrok http 3001 → https://abc.ngrok.io
  → coller dans Settings → "URL serveur public"
  → /api/health → https://abc.ngrok.io/api/health → ton Express → 200 ✅
  → Tout marche depuis le preview Lovable en live !
```

### Fichiers à modifier

1. `package.json` — ajouter `concurrently` (devDep) + script `dev:all`
2. `src/lib/serverApi.ts` — support `baseUrl` optionnel pour toutes les fonctions
3. `src/store/vrStore.ts` — ajouter champ `publicServerUrl`
4. `src/pages/Settings.tsx` — input ngrok URL + guide
5. `src/components/dashboard/DashboardLayout.tsx` — passer `publicServerUrl` au badge
