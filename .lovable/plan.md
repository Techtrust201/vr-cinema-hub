
## État actuel

Tout est en place :
- `serverApi.ts` a `checkServer`, `fetchServerDevices`, `pushSync`, `getVideoUrl`
- `VideoPreviewModal.tsx` a le placeholder mais ne teste pas le serveur ni ne charge le vrai fichier
- `Devices.tsx` a le formulaire manuel mais pas de bouton "Détecter via ADB"
- `Sync.tsx` fait uniquement la simulation, ne branche pas `pushSync` quand le serveur est dispo
- Le `ServerModeBadge` dans le layout poll le serveur toutes les 15s — status disponible localement dans chaque composant

Le serveur fait des appels `http://localhost:3001` depuis le preview Lovable (hébergé en HTTPS) → toujours bloqué par le navigateur (mixed content). C'est attendu en prévisualisation. Quand l'app est lancée en local, ça marchera. L'app doit quand même être câblée correctement.

## 3 features à implémenter

### 1. VideoPreviewModal — vrai lecteur HTML5 si serveur connecté

**Logique** :
- Ajouter `serverStatus` : la modale vérifie `checkServer(settings.serverUrl)` à l'ouverture (une seule fois, stocké en state)
- Si `connected` : afficher un `<video>` HTML5 avec `src={getVideoUrl(settings.serverUrl, video.name)}`
  - State : `videoState: "loading" | "ready" | "error"`
  - `onLoadedData` → "ready", `onError` → "error" (fallback placeholder)
  - Pendant loading : spinner avec le même design
  - En cas d'erreur : placeholder actuel + message "Fichier introuvable sur le serveur"
- Si `disconnected` : placeholder actuel inchangé (mais texte mis à jour : "Démarrez le serveur local pour lire")
- La timeline simulée reste pour le mode déconnecté ; en mode connecté, les contrôles natifs de la balise `<video>` prennent le relai (ou on garde la barre custom avec `currentTime`/`duration` du vrai lecteur)

**Changement minimal** dans `VideoPreviewModal.tsx` :
- Remplacer la zone preview (lines 152–224) par un composant conditionnel
- Ajouter `useEffect` au montage pour `checkServer` → `setServerStatus`
- Ajouter `videoRef = useRef<HTMLVideoElement>(null)` pour contrôler play/pause
- Quand connecté + prêt : `<video ref={videoRef} src={...} className="w-full h-full object-contain" />` dans l'`aspect-video`
- Le bouton play/pause existant appelle `videoRef.current.play()` / `.pause()`
- La barre de progression se met à jour depuis `videoRef.current.currentTime`

### 2. Devices — bouton "Détecter via ADB"

**Logique** :
- Au montage de `Devices`, faire un `checkServer` → `setServerStatus`
- Bouton "Détecter via ADB" visible dans le header (à côté des boutons existants), désactivé si serveur déconnecté
- Au clic : `fetchServerDevices(settings.serverUrl)` → liste de `ServerDevice[]`
- Ouvrir une modal ou un panel avec les appareils détectés, chaque ligne avec un bouton "Ajouter"
- Pré-remplir le formulaire `AddDeviceModal` avec les valeurs ADB : `serial`, `model` → `name`, `ipAddress`
- Gérer les erreurs avec un `toast.error`

**Changement dans `Devices.tsx`** :
- Ajouter state `serverStatus` + `adbDetecting` + `adbDevices`
- Nouveau bouton dans le header
- Après détection : afficher un dropdown/panel avec la liste + bouton "Ajouter" par entrée
- Pré-remplissage du formulaire AddDeviceModal (passer `initialValues` en prop)

### 3. Sync — vraie sync ADB si serveur connecté

**Logique** :
- Vérifier `serverStatus` au démarrage de `Sync` (comme pour les autres)
- Quand `handleSync` est appelé :
  - **Si serveur connecté** : appeler `pushSync(serverUrl, { deviceSerial, videoStoragePath, videos })`
    - Pour chaque appareil cible : une requête POST `/sync`
    - Les logs viennent du `result.lines` final (le serveur retourne tout d'un coup)
    - Pendant l'attente : afficher un spinner + "Sync ADB en cours…" + progress simulée (puisqu'il n'y a pas de streaming réel)
    - À la fin : `updateSyncLog` avec les vrais logs du serveur
    - Mettre à jour `lastSyncAt` des devices
  - **Si serveur déconnecté** : comportement actuel (simulation) inchangé
- Indicateur visuel dans le panel config : badge "Mode réel" (vert) ou "Simulation" (orange)

**Changement dans `Sync.tsx`** :
- Ajouter `serverStatus` state + `checkServer` au montage
- Modifier `handleSync` pour bifurquer selon `serverStatus`
- Pour la vraie sync : `async/await` avec un `for...of` sur `targetDevices`, chaque appel à `pushSync`, concaténation des logs
- Ajouter un badge de mode dans le panneau configuration

## Fichiers à modifier

1. `src/components/dashboard/VideoPreviewModal.tsx` — lecteur HTML5 conditionnel
2. `src/pages/Devices.tsx` — bouton ADB detect + modal de sélection + pré-remplissage
3. `src/pages/Sync.tsx` — vraie sync quand serveur présent, simulation sinon
