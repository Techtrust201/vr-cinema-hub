## Comportement actuel

Quand tu cliques "Ajouter" sur un casque détecté ADB, le formulaire s'ouvre avec **seulement** : serial, nom (basique), IP (si déjà connue). Le stockage par défaut est `128 GB` (pas lu du casque), la batterie n'est pas affichée.

## Ce que je change

**On garde la popup "Ajouter un casque"** — tu pourras toujours vérifier/modifier avant de valider. Mais elle s'ouvre **pré-remplie automatiquement** avec les vraies infos lues du casque via ADB.

### Étape par étape côté UX

1. Tu cliques "Ajouter" sur Quest 3 dans la popup ADB.
2. Pendant 1-2 s, un mini-loader s'affiche → on interroge ADB en parallèle pour :
   - **Modèle exact** (déjà reçu, ex: "Quest 3") → champ Nom = `Meta Quest 3`
   - **IP Wi-Fi** via `fetchDeviceIp` → champ Adresse IP
   - **Stockage total + utilisé + batterie** via `fetchDeviceStatus` → champ Stockage total (sélecteur ajusté à la vraie valeur)
3. Le formulaire s'ouvre **avec tous les champs pré-remplis**.
4. Tu vérifies, tu modifies si besoin (ex: renommer "Meta Quest 3" → "Quest Salon"), tu changes le type Location/Animations, puis tu cliques **Ajouter** comme d'habitude.

### Détails techniques

- `src/pages/Devices.tsx` :
  - `handleAddFromAdb(d)` devient async : appelle `Promise.allSettled([fetchDeviceStatus, fetchDeviceIp])` avant d'ouvrir le modal.
  - Pendant l'appel : état `prefilling: serial` → spinner sur le bouton "Ajouter" de la ligne ADB.
  - `AddDeviceModal` accepte de nouveaux props : `initialStorageTotalGB`, `initialStorageUsedGB`, `initialBattery`, `initialStatus` ("connected").
- `AddDeviceModal` :
  - Le sélecteur stockage gère une valeur custom (si ADB renvoie 256, on l'affiche même si pas dans la liste par défaut).
  - Petite ligne d'info affichée sous le formulaire : "✓ Détecté via ADB — batterie 87%, stockage 42/128 GB" pour confirmer visuellement que les données sont fraîches.
  - À la validation, on enregistre aussi `storageUsedGB`, `battery`, `status: "connected"` (au lieu de `disconnected` + 0).
- Si une requête ADB échoue, on ouvre quand même le modal avec ce qui est connu + un toast discret "Certaines infos n'ont pas pu être lues".

Aucun changement backend nécessaire.