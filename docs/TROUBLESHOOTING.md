# Dépannage

> Tout le dépannage casque est dans **[`HEADSET_ONBOARDING.md` § 10](./HEADSET_ONBOARDING.md#10-dépannage)**.
> Les pannes de stockage sont dans **[`STOCKAGE.md` § Diagnostic](./STOCKAGE.md#diagnostic)**.

Pour un diagnostic rapide :

```bash
adb logcat -v time -s Unity:I | grep -E 'Heartbeat|Manifest|SyncLifecycle|SyncReport|BackendConfig|Error|Exception'
```

## Par symptôme

### Un film apparaît dans la bibliothèque du casque mais reste noir

Presque toujours un problème de codec. Le casque n'affiche aucun message : la
lecture démarre, et l'image ne vient jamais.

```bash
npx vite-node scripts/probe-real-files.mts -- /chemin/du/film.mp4
```

Tout ce qui n'est pas du H.264 sous 4K est suspect. Le tableau de bord refuse
désormais les formats impossibles à l'envoi, mais les films ajoutés avant ce
contrôle peuvent encore être en cause. Réencodez en H.264 et remplacez le film.

### Le lecteur s'affiche mais aucune image n'apparaît derrière

À distinguer du cas précédent : ici l'écran n'est même pas noir, il n'y a
simplement rien. C'est le symptôme d'une image affichée hors du champ de
vision, pas d'un problème de lecture — les traces montrent alors un décodeur
parfaitement sain, ce qui égare le diagnostic.

Cela concernait les films au format « cinéma », dont l'écran était accroché à
un point fixe de la scène : selon l'endroit où le spectateur s'était installé,
il pouvait se retrouver derrière lui. L'écran se place désormais devant le
spectateur au lancement de chaque film. Pour vérifier, chercher dans les
traces :

```bash
adb logcat -s Unity:V | grep 'placé devant'
```

La valeur `faceAuSpectateur` doit être proche de `1,00`. Une valeur négative
signifie que l'écran présente son dos, que le moteur n'affiche pas.

### Un casque reste bloqué en téléchargement

Vérifier d'abord que les fichiers sont réellement accessibles :

```bash
node scripts/r2-check.mjs
```

| Réponse | Cause |
|---|---|
| `206` | le stockage répond normalement, chercher ailleurs |
| `403` | identifiants R2 faux, ou horloge de la machine décalée |
| `404` | l'objet manque dans le bucket alors que la base le référence |

### Un casque ne reçoit pas une nouvelle playlist

Utiliser le bouton **Analyser** de la page Synchronisation. Le compte rendu dit
si une playlist est attribuée, par quel chemin, et si les déclencheurs de mise à
jour sont bien présents en base.

Si le contrôle automatique signale « Ce casque ne serait pas prévenu », un
déclencheur manque : comparer avec `supabase/migrations/`.

### L'envoi d'un film échoue à la dernière étape

Les octets partent, puis la finalisation échoue. C'est la signature d'un CORS
incomplet : le navigateur n'a pas le droit de lire l'en-tête `ETag` des morceaux.

```bash
node scripts/r2-cors.mjs --show   # vérifier
node scripts/r2-cors.mjs          # réappliquer
```

Une nouvelle adresse de tableau de bord doit être ajoutée à la liste `ORIGINS`
du script.

### Les miniatures ne s'affichent pas dans le tableau de bord

Les vidéos hébergées hors de Supabase Storage ont besoin d'une URL signée. Si
les miniatures manquent uniquement pour ces vidéos, vérifier que la fonction
`headset-manifest` déployée est bien à jour.

### Doute sur la signature des accès au stockage

```bash
npx vitest run supabase/functions/_shared/r2.test.ts
```

Ces tests rejouent le vecteur officiel d'AWS : ils échouent si l'algorithme de
signature est cassé, ce qui écarte cette piste en quelques secondes.

### Une demande de permission apparaît au démarrage du casque

Le greffon OpenXR d'Unity réclame l'accès au suivi oculaire dès que le rendu
fovéal est activé, sans vérifier que le casque en est capable. Le Quest 3 n'a
pas de capteurs oculaires — la fenêtre s'affiche donc pour une fonction qui ne
marchera jamais, et elle bloque le premier démarrage jusqu'à ce que quelqu'un
enfile le casque et réponde.

Unity n'expose aucun réglage pour l'éviter : désactiver la fonction supprimerait
aussi le rendu fovéal fixe, qui lui fonctionne et compense la résolution
augmentée utilisée pour la netteté. En revanche, le greffon vérifie d'abord si
l'autorisation est déjà donnée. L'accorder par câble pendant la préparation
suffit donc à ne plus jamais voir la fenêtre, sans rien dégrader :

```bash
scripts/prepare-headset.sh
```

Le script installe l'application et accorde l'autorisation sur tous les casques
branchés, puis vérifie ce que le système a réellement retenu. Sans cette étape,
la fenêtre revient à chaque démarrage à froid et quelqu'un doit la fermer dans
le casque — ce qui ruine tout déploiement sans intervention.

## Vérifier un casque sans le porter

Deux outils permettent de contrôler un casque à distance, ce qui évite de
mobiliser quelqu'un pour l'enfiler à chaque vérification.

Voir ce que le casque affiche :

```bash
adb exec-out screencap -p > casque.png
```

Lancer un film sans manette, en déposant un fichier témoin contenant son
numéro (0 pour le premier, 3 pour le quatrième) :

```bash
D=/storage/emulated/0/Android/data/com.techtrust.vrcinemaquest/files
adb shell "echo -n 3 > $D/autoplay"
adb shell am force-stop com.techtrust.vrcinemaquest
adb shell am start -n com.techtrust.vrcinemaquest/com.unity3d.player.UnityPlayerGameActivity
```

Le film démarre seul au bout d'une quinzaine de secondes, par le chemin de
lecture habituel. L'application mesure alors la position de l'image par
rapport au regard, ce qui distingue une panne d'affichage d'une panne de
lecture.

Supprimer le témoin rend l'application à son comportement normal ; tant qu'il
est absent, ce mécanisme reste totalement inerte.

```bash
adb shell "rm -f $D/autoplay"
```

### Le casque affiche la pièce au lieu de l'application

Après un redémarrage, le casque perd son suivi de position et le signale ainsi :

```bash
adb logcat -d | grep '6dof tracking'
```

`Notifying idle due to no 6dof tracking` signifie qu'il est immobile depuis
trop longtemps. Il continue de fonctionner — l'application tourne, lit ses
vidéos et répond — mais le compositeur ne montre plus que les caméras de
passthrough. Aucune commande ne rétablit le suivi : il faut prendre le casque
et le bouger. C'est la limite du contrôle à distance, à connaître avant de
conclure à une panne d'affichage.
