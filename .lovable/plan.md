
## Clarification de l'architecture et plan de données réelles

### Ce que cette app EST vs CE QU'ELLE PEUT DEVENIR

**Actuellement** : Frontend React pur. Toutes les données sont des mocks dans un store Zustand persisté en localStorage. Aucune vraie connexion.

**Ce qu'on peut rendre réel dans ce frontend** :
1. Les données des vidéos (vrais noms, vrais formats, vraies tailles) → entrées manuelles persistées
2. Les données des casques (vrais serials, vraies IP) → entrées manuelles persistées  
3. L'historique des syncs → généré par de vraies syncs

**Ce qui nécessitera un backend séparé** (hors Lovable) pour être VRAIMENT fonctionnel :
- La sync ADB réelle → un serveur Node.js local qui tourne sur ton ordinateur et expose une API REST
- La lecture des fichiers vidéo → servir les MP4 depuis ton disque via un serveur local (Express / Python)

---

### Plan immédiat : Nettoyer les faux mocks, permettre la saisie de vraies données

#### Étape 1 — Vider les faux mocks du store
- Supprimer `MOCK_DEVICES` et `INITIAL_LIBRARIES` hardcodés
- Démarrer avec des bibliothèques vides + 0 casque (ou garder les structures mais vider les données)
- L'utilisateur entre SES vrais casques (serial réel, IP réelle, type réel)
- L'utilisateur entre SES vraies vidéos (vrais noms de fichiers, vrais formats, vraies tailles)

#### Étape 2 — Améliorer le formulaire "Ajouter un casque"
Champs : Nom personnalisé, Numéro de série Quest réel, Adresse IP Wi-Fi réelle, Type (Location/Animations), Stockage total (128/256 GB)

#### Étape 3 — Améliorer le formulaire "Ajouter une vidéo"
Champs : Nom exact du fichier (ex: `Mon_Experience_360.mp4`), Format (360/180), Stéréo (Mono/SBS/OU), Durée réelle, Taille réelle en GB

#### Étape 4 — Page "Connexion serveur local" dans Paramètres
Ajouter un champ `URL du serveur local` (ex: `http://localhost:3001`) avec un bouton "Tester la connexion". Ce serveur Node.js (que je fournis sous forme de script) tourne sur ton Mac/PC et reçoit les ordres de sync ADB. Quand le serveur n'est pas détecté → mode "simulation" avec un badge orange "Mode démo". Quand détecté → mode "réel" avec badge vert "Serveur connecté".

#### Étape 5 — Fournir le script serveur Node.js (dans un fichier `server/sync-server.js`)
Un fichier Express minimal que tu lances avec `node server/sync-server.js` sur ton ordinateur :
- `GET /devices` → exécute `adb devices` et retourne les serials détectés
- `POST /sync` → exécute `adb push` pour chaque vidéo vers le casque
- `GET /video/:name` → sert le fichier MP4 depuis ton dossier de stockage

#### Fichiers à modifier/créer
1. `src/store/vrStore.ts` — supprimer les mocks, partir de zéro
2. `src/pages/Settings.tsx` — ajouter champ `serverUrl` + bouton "Tester la connexion"
3. `src/pages/Devices.tsx` — améliorer le formulaire d'ajout avec les vrais champs
4. `src/pages/Libraries.tsx` — améliorer le formulaire d'ajout vidéo avec les vrais champs
5. `server/sync-server.js` — nouveau fichier script Node.js (documentation/template)
6. `src/lib/serverApi.ts` — nouveau : fonctions `checkServer()`, `fetchDevices()`, `pushSync()` qui appellent le serveur local quand disponible, sinon mode simulation

### Ce que l'utilisateur verra
- Un badge "Mode démo 🟠" ou "Serveur connecté 🟢" dans le header
- Ses vrais casques dans la liste une fois saisis
- Ses vraies vidéos dans les bibliothèques une fois saisies
- Une vraie sync quand le serveur Node.js tourne sur son ordinateur
