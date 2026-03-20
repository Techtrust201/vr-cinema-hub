
## Ce que je comprends

La page actuelle est juste une **documentation README** statique. Ce n'est pas du tout l'application. L'utilisateur veut que je construise le **dashboard web complet** — l'application réelle qui gère ses bibliothèques VR, ses casques et ses synchronisations.

## Ce que je vais construire : Le Dashboard VR Ultimate

Une application web complète à 4 pages, dark & tech, opérationnelle :

```text
/ (Accueil)           → Vue d'ensemble, status live des casques
/libraries            → Gestion bibliothèques Location + Animations
/devices              → Casques connectés (ADB simulé)
/sync                 → Lancer la synchronisation push
```

### Détail des 4 pages

**1. Accueil (`/`)** — Dashboard live
- Header avec logo VR Ultimate + indicateur de statut
- 4 KPI cards : nb vidéos Location, nb vidéos Animations, casques connectés, dernière sync
- Activité récente (logs de sync)
- Accès rapide aux 3 sections

**2. Bibliothèques (`/libraries`)**
- Deux onglets : Location | Animations
- Chaque bibliothèque liste ses playlists avec accordéon
- Dans chaque playlist : liste des vidéos avec badge 360°/180°, format stéréo, taille
- Bouton "+ Ajouter playlist" (modal)
- Zone drag & drop pour uploader des vidéos (simulé dans le front)
- Badge de statut par vidéo (360/180, Mono/SBS, taille)

**3. Casques (`/devices`)**
- Liste des casques détectés (simulés avec données réalistes)
- Card par casque : identifiant série, statut (connecté/déconnecté), type (Location/Animations), espace disque
- Bouton "Rafraîchir" (appel ADB)
- Instructions de connexion USB + Wi-Fi

**4. Sync (`/sync`)**
- Sélecteur : bibliothèque (Location / Animations)
- Sélecteur : casque cible (un précis ou "Tous")
- Bouton "Lancer la sync"
- Progress bar animée + logs de progression en temps réel (simulé)
- Historique des syncs récentes avec statut ✅/❌

### Design
- Même design system Dark VR déjà en place (violet/cyan, glows, animations)
- Navigation sidebar ou topbar avec les 4 sections
- Responsive mobile

### Fichiers à créer/modifier
- `src/pages/Index.tsx` → Dashboard home
- `src/pages/Libraries.tsx` → Bibliothèques
- `src/pages/Devices.tsx` → Casques
- `src/pages/Sync.tsx` → Synchronisation
- `src/components/dashboard/` → Composants réutilisables (StatsCard, VideoRow, DeviceCard, SyncLog, etc.)
- `src/App.tsx` → Routes vers les 4 pages
- Supprimer tous les composants `readme/` devenus inutiles

> Note : Sans backend réel (Next.js/Node), les données seront gérées en state React (localStorage pour la persistance). Les appels ADB réels nécessitent le serveur Node.js du projet VR — le dashboard web ici simule l'interface ; les vraies commandes ADB se font côté serveur.
