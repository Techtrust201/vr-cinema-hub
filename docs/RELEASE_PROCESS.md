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

## Unity APK

```bash
/home/hugo/Unity/Hub/Editor/6000.3.17f1/Editor/Unity -batchmode -quit -nographics \
  -projectPath /home/hugo/work/vr-cinema-hub/vr-cinema-quest-app-unity \
  -executeMethod CommandLineBuild.BuildAndroidApk \
  -logFile /tmp/vr-cinema-quest-build.log
```

Sortie : `vr-cinema-quest-app-unity/builds/VR-Cinema-Quest.apk`  
Scène forcée : `Assets/Scenes/MainVR.unity` (indépendant de SampleScene historique).
