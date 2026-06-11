## Diagnostic confirmé

L'edge function `headset-manifest` fonctionne correctement. Le device token identifie bien le casque `test emulate casque unity` (id `b67e0e14-9b71-4f1b-9a34-0ff099526f98`), trouve bien son groupe `Float Region PACA`, trouve bien l'assignment vers la playlist `video de la mer`… mais la table de liaison `playlist_videos` est **vide** : la vidéo `test-360-location.mp4` n'a jamais été liée à la playlist côté dashboard.

C'est donc **un bug de données ET un bug d'UX** dans la page Playlists (elle laisse créer/assigner une playlist sans avoir réellement persisté les vidéos sélectionnées).

## Étapes

### 1. Fix immédiat (data)
Insérer la ligne manquante via l'outil insert :

```sql
INSERT INTO playlist_videos (playlist_id, video_id, position)
VALUES ('93bb2ea3-8dfc-4dda-83e6-14f22379071d',
        'e18d3426-acbd-4cc7-a4e5-b1ac58e4c7b3',
        0);
```

Effet attendu : au prochain cycle de sync Unity, `headset-manifest` renverra 1 vidéo avec son `download_url` signée 15 min, et la log Unity passera à `Manifest reçu : 1 vidéo(s)`.

### 2. Inspection de `src/pages/Playlists.tsx`
Lire la page pour comprendre pourquoi l'utilisateur a vu la vidéo "dans" la playlist alors qu'aucune ligne n'a été insérée en base. Hypothèses à valider :
- la sélection de vidéos est gardée en state local mais l'insert dans `playlist_videos` n'est jamais déclenché ;
- ou un insert échoue silencieusement (RLS, erreur réseau non remontée) ;
- ou le drag-and-drop de réordonnancement écrase les positions au lieu d'insérer.

### 3. Correction UI Playlists
Selon ce que révèle l'étape 2 :
- garantir que l'ajout d'une vidéo déclenche bien un `insert into playlist_videos` et remonte une erreur visible (toast) en cas d'échec ;
- afficher dans la liste des playlists un compteur `X vidéos` lu réellement depuis `playlist_videos` (pas depuis un state local) pour qu'on détecte immédiatement une playlist vide ;
- en option : avertir l'utilisateur si une playlist sans vidéos est diffusée à un groupe ("cette playlist est vide, aucun casque ne recevra rien").

### 4. Hardening edge function (optionnel mais utile)
Dans `supabase/functions/headset-manifest/index.ts`, ajouter quelques `console.log` structurés pour faciliter le debug futur :
- `headset_id` extrait du token
- nombre de groupes trouvés
- nombre d'assignments matchés (par type : all / group / headset)
- nombre de lignes `playlist_videos` matchées
- nombre final de vidéos renvoyées

Aucune modification de logique, juste de l'observabilité. Lisible ensuite via les logs de la fonction.

### 5. Vérification
- Relancer le script `scripts/test-headset-flow.sh` ou simplement attendre le prochain cycle de sync côté Unity.
- Logs Unity attendus : `Manifest reçu : 1 vidéo(s)` puis `Téléchargement OK`.

## Ce qui **n'est pas** le bug (pour info)
- ❌ Pas un problème de device token : le casque est bien identifié.
- ❌ Pas un problème de jointure groupe→playlist : l'assignment existe et est correctement matché.
- ❌ Pas un problème de RLS sur la fonction : elle tourne en service role.
- ✅ C'est `playlist_videos` qui est vide, plus un bug UX dans la page Playlists qui a laissé croire que l'ajout était fait.
