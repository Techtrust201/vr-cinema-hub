
# Plan A — Première sync avec une vidéo VR de test

## Objectif
Te fournir un fichier vidéo VR 360° de test (léger, ~10 s) que tu déposes dans ton dossier de stockage, puis lancer une vraie synchronisation ADB vers le Quest 3 pour valider la chaîne complète.

## Étape 1 — Générer une vidéo VR 360° de test (Remotion)

Je vais créer une courte vidéo équirectangulaire (format 360° standard) :

- **Résolution** : 4096 × 2048 (ratio 2:1 équirectangulaire — requis pour 360°)
- **Durée** : 10 secondes à 30 fps
- **Contenu** : grille de longitude/latitude animée + texte "VR ULTIMATE — TEST 360°" qui dérive, sur fond dégradé violet/cyan (palette du projet)
- **Codec** : H.264 MP4, muet
- **Nom de fichier** : `test-360-location.mp4`
- **Sortie** : `/mnt/documents/test-360-location.mp4` → tu la télécharges via l'artifact

Tu pourras la lire dans n'importe quel player 360° (YouTube VR, Quest, ton propre preview Three.js).

## Étape 2 — Déposer la vidéo dans ton stockage local

1. Télécharger `test-360-location.mp4` depuis l'artifact
2. La copier dans le dossier configuré dans **Paramètres → Chemin de stockage** (`VIDEO_STORAGE_PATH`, par défaut `/videos/vr-ultimate`)
3. Dans la web app → **Bibliothèques → Location** → cliquer **Rafraîchir** : la vidéo doit apparaître avec sa taille et son format détecté (360 mono)

## Étape 3 — Lancer la sync vers le Meta Quest 3

1. Aller dans **Synchronisation**
2. Sélectionner **Meta Quest 3 (2G0YC1ZG1M02RF)**
3. Cocher `test-360-location.mp4`
4. Cliquer **Lancer la synchronisation**
5. Observer le log SSE en temps réel :
   - `Connexion ADB → 2G0YC1ZG1M02RF`
   - `Appareil connecté ✓`
   - `Push: test-360-location.mp4 (X.X GB)…`
   - `test-360-location.mp4 — 25% / 50% / 75% / 100%`
   - `✓ test-360-location.mp4 — terminé`
   - `manifest.json envoyé ✓`
   - `Sync terminée — 1 envoyé(s), 0 ignoré(s), 0 erreur(s).`

## Étape 4 — Vérifier sur le casque

Dans un terminal :
```
adb -s 2G0YC1ZG1M02RF shell ls -lh /sdcard/Movies/VR-Ultimate/
```
→ tu dois voir `test-360-location.mp4` + `manifest.json`

Sur le Quest : Files → Movies → VR-Ultimate → la vidéo doit être présente et lisible.

## Étape 5 — Re-lancer la sync (test idempotence)

Relancer la même sync : le log doit afficher
`Skip: test-360-location.mp4 (déjà présent, même taille)` → confirme que la détection de doublons fonctionne.

---

## Détails techniques (Remotion)

- Scaffold sous `remotion/` (versionné dans le projet pour pouvoir re-générer)
- 1 scène unique avec :
  - Fond `linear-gradient` violet (#7c3aed) → cyan (#06b6d4) → noir (#0a0a0f)
  - Grille équirectangulaire SVG (méridiens + parallèles) qui tourne lentement
  - Titre "VR ULTIMATE" en gros + sous-titre "TEST 360° • LOCATION" qui apparaît avec spring
  - Compteur de secondes en bas (utile pour vérifier que la vidéo joue bien sur le casque)
- Rendu via `scripts/render-remotion.mjs` (méthode recommandée sandbox)
- Fichier final livré en tant que `<presentation-artifact>` téléchargeable

## Ce que je ne fais PAS dans ce plan

- Aucune modification du code de l'app (UI, serveur, store) — l'objectif est juste de valider le pipeline existant
- Pas de génération de plusieurs vidéos — une seule suffit pour le test (on pourra en faire d'autres après si besoin : 180°, animations, etc.)
