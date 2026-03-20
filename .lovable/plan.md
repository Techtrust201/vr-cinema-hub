
## Contexte — Ce que l'utilisateur demande et ce qui est faisable

**Question clé** : L'utilisateur veut des "vraies données" pour tester. Il faut lui expliquer précisément ce qui est réel vs ce qui ne peut pas l'être dans un frontend pur, puis injecter des données de test réalistes.

### Réalité de l'architecture (à expliquer clairement dans le plan)

| Fonctionnalité | Statut | Condition |
|---|---|---|
| Vidéos (noms, formats, tailles, durées) | ✅ Données réelles simulées | Saisie manuelle ou seed |
| Casques (serial, IP, type) | ✅ Données réelles simulées | Saisie manuelle ou seed |
| Historique des syncs | ✅ Données réalistes | Générées par le store |
| Lecture vidéo HTML5 | ❌ Pas lisible en preview | Nécessite le serveur local Node.js + vrais fichiers MP4 sur ton disque |
| Sync ADB réelle | ❌ Pas fonctionnel en preview | Nécessite `node server/sync-server.js` + casques Quest branchés en USB/Wi-Fi |
| Détection ADB | ❌ Pas fonctionnel en preview | Même condition |

**En résumé** : Le preview Lovable est hébergé en HTTPS sur leurs serveurs. Appeler `http://localhost:3001` depuis une page HTTPS est bloqué par tous les navigateurs (mixed content). Ce n'est pas un bug de l'app — c'est une règle de sécurité du navigateur. L'app marchera à 100% quand tu la lanceras **localement** avec `npm run dev`.

---

### Ce que je vais faire : injecter des données de test réalistes dans le store

Au lieu de partir d'un état vide, je vais pré-remplir le store avec des données qui ressemblent à de vraies données terrain.

**Vidéos (Location library)**
- Playlist "Paris - Cathédrale Notre-Dame" : 3 vidéos 360° mono, vraies durées, vraies tailles (2–5 GB)
- Playlist "New York - Times Square" : 2 vidéos, 1 en 360 SBS, 1 en 180 OU

**Vidéos (Animations library)**
- Playlist "Expériences Interactives" : 2 vidéos 180° SBS (haute résolution)
- Playlist "Visites Guidées" : 2 vidéos 360° mono

**Casques** (3 appareils)
- Quest Pro 1 — serial `3A4F8B2C1D9E0F5A`, IP `192.168.1.101`, Location, connected, 87 GB / 128 GB, batterie 72%, dernière sync il y a 2 jours
- Quest 3 Studio — serial `7E2A9C4B6F1D3E8A`, IP `192.168.1.102`, Animations, connected, 45 GB / 256 GB, batterie 91%, dernière sync il y a 10 jours (→ déclenche l'alerte "non synchronisé depuis 7 jours")
- Quest 2 Demo — serial `1B3D5F7A9C2E4G6H`, IP `192.168.1.103`, Location, disconnected, 62 GB / 128 GB, batterie 34%, jamais synchronisé

**Sync logs** (4 entrées)
- Sync réussie hier soir : 5 fichiers poussés, 2 skippés — Location → Quest Pro 1
- Sync réussie il y a 3 jours : 3 fichiers — Animations → Quest 3 Studio
- Sync en erreur il y a 5 jours (connexion perdue) — Location → Quest 2 Demo
- Sync réussie il y a 2 semaines : 7 fichiers — Location → Quest Pro 1

---

### Implémentation technique

**Option choisie** : Ajouter une fonction `seedData()` dans `vrStore.ts` et l'appeler conditionnellement au montage si le store est vide (0 vidéos ET 0 casques). Cela ne remplace pas les données existantes si l'utilisateur a déjà saisi des vraies données.

Alternativement, plus simple : ajouter un bouton "Charger des données de démo" dans la page Paramètres, à côté du bouton "Réinitialiser". Il appelle `loadDemoData()` qui peuple le store avec les données ci-dessus.

**Choix final** : Les deux — auto-seed si le store est vide + bouton dans Paramètres pour recharger.

### Fichiers à modifier

1. `src/store/vrStore.ts` — Ajouter `DEMO_DATA` (bibliothèques + casques + logs) + action `loadDemoData()`
2. `src/pages/Settings.tsx` — Ajouter bouton "Charger données de démo" à côté du reset
3. Vérifier que le store s'initialise avec les démo data si vide au démarrage (via `zustand` persist initialisation)

### Stratégie d'auto-seed

Dans `vrStore.ts`, au lieu de `EMPTY_LIBRARIES`, utiliser `DEMO_LIBRARIES` comme valeur initiale par défaut. Puisque Zustand `persist` hydrate depuis localStorage, les données de test n'écraseront les données existantes que si le storage est vide (nouveau utilisateur ou après reset).

Cela signifie que je remplace simplement `EMPTY_LIBRARIES` et `[]` par les vraies données de demo dans les valeurs initiales du store. Un utilisateur existant (localStorage déjà rempli) ne sera pas affecté.
