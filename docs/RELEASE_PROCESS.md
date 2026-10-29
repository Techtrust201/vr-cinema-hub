# Processus de release

## Web (vr-cinema-hub)

Gestionnaire officiel : **npm** + `package-lock.json` (README / Lovable / Vercel).  
Les fichiers `bun.lock` / `bun.lockb` concernent surtout remotion ; ne pas les traiter comme source de vérité pour l’app principale.

```bash
cd /home/hugo/work/vr-cinema-hub
npm install
npm run test
npm run build
npx tsc --noEmit -p tsconfig.app.json
```

Note `npm ci` / iceberg-js : si le lockfile est désynchronisé (généré avec bun ou dépendances manquantes), préférer `npm install` puis committer un `package-lock.json` cohérent.

## Application casque (APK DLPAlexandre)

Une seule commande, après avoir commité les modifications du projet Unity :

```bash
scripts/release-headset-app.sh --notes "Ce qui change, en une phrase"
```

Elle construit l'APK, vérifie qu'il pourra s'installer par-dessus la version en place
(même package, même clé de signature, numéro de version supérieur), commite le changement de
version dans le dépôt Unity, envoie le fichier sur R2 sous `releases/` puis l'annonce dans
`app_releases`. Dès la fin du script, le bouton « Télécharger DLPAlexandre.apk » de la page
Casques propose cette version, avec sa date et son heure de publication.

- `--dry-run` : build et contrôles seulement, rien n'est publié ni commité. À faire avant de
  publier une version non encore essayée sur un casque.
- `--skip-build` : publie `builds/DLPAlexandre.apk` tel quel (après un essai à blanc validé).
- Prérequis, une seule fois : `SUPABASE_SECRET_KEY=sb_secret_…` dans `origin/.env`.
- Revenir en arrière : supprimer la ligne fautive de `app_releases` ; la version précédente
  redevient celle proposée. Les APK ne sont jamais écrasés sur R2.

Ordre de déploiement : migrations (`20261029090000_video_yaw_offset.sql`,
`20261029091000_app_releases.sql`) **avant** les Edge Functions `headset-manifest` et
`app-release-latest` — le manifeste lit `videos.yaw_offset_deg` et tomberait en erreur 500
sans la colonne.

La clé de signature est `~/.android/debug.keystore` (empreinte SHA-256
`21d80dbd…9439ac42`, vérifiée par le script). La perdre rend toute mise à jour impossible sans
désinstaller, ce qui efface films et appairage : en garder une copie hors de ce poste.

Build seul, sans publication :

```bash
/home/hugo/Unity/Hub/Editor/6000.3.17f1/Editor/Unity -batchmode -quit -nographics \
  -projectPath /home/hugo/work/vr-cinema-hub/vr-cinema-quest-app-unity \
  -executeMethod CommandLineBuild.BuildAndroidProduction \
  -logFile /tmp/dlpalexandre-build.log
```

Sortie : `vr-cinema-quest-app-unity/builds/DLPAlexandre.apk`  
Scène forcée : `Assets/Scenes/MainVR.unity` (indépendant de SampleScene historique).
