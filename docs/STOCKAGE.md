# Stockage des vidéos

Où vivent les fichiers, combien ça coûte, et quoi faire quand ça coince.

## En une phrase

Les **métadonnées** (titres, playlists, casques, assignations) sont dans Supabase.
Les **fichiers vidéo** sont dans un bucket **Cloudflare R2**. Aucune machine de
l'exploitant n'a besoin d'être allumée pour qu'un casque se synchronise.

## Pourquoi pas Supabase Storage

L'offre gratuite de Supabase plafonne le stockage à 50 Mo. Un film VR en 4K pèse
entre 300 Mo et 1 Go. Le bucket Storage reste utilisable pour de petits fichiers
de test, mais il ne peut pas porter un catalogue.

## Pourquoi R2 plutôt qu'un autre stockage objet

Chaque casque télécharge sa **propre copie complète** de chaque film. Avec un
catalogue de 6 Go et 50 casques, un déploiement représente 300 Go de trafic
sortant. C'est ce poste qui décide du coût :

| | Stockage | Trafic sortant | Coût mensuel typique |
|---|---|---|---|
| **Cloudflare R2** | 10 Go offerts, puis 0,015 $/Go | **gratuit, sans plafond** | **0 €** |
| Amazon S3 | 0,023 $/Go | 0,09 $/Go | ~27 $ pour 300 Go |
| Supabase Storage payant | inclus dans l'offre Pro | facturé au-delà du quota | 25 $/mois minimum |

Les lectures sont facturées au-delà de 10 millions par mois. Un casque télécharge
par tranches de 8 Mo, soit environ 75 requêtes par film : 50 casques et 10 films
représentent 37 500 requêtes, très loin du seuil.

**Le catalogue actuel occupe 2,25 Go sur les 10 Go gratuits.**

## Le trajet d'un fichier

### À l'envoi, depuis le dashboard

1. Le navigateur calcule l'empreinte SHA-256 du fichier, en flux, sans le charger
   en mémoire.
2. Il demande une autorisation d'écriture à l'Edge Function `origin-upload-url`.
   **C'est le serveur qui décide du stockage**, pas le navigateur : il n'y a
   aucune variable `VITE_…` à synchroniser, donc rien à oublier de mettre à jour.
3. Au-delà de 32 Mo, l'envoi est découpé en morceaux signés séparément. Une
   coupure réseau ne fait perdre que le morceau en cours, pas le fichier entier.
4. La ligne est créée dans `videos` avec `origin = 'r2'` et son empreinte.

### À la lecture, depuis un casque

1. Le casque appelle `headset-manifest` avec son jeton d'appareil.
2. Pour chaque film, la fonction signe une URL R2 valable **6 heures**. Le bucket
   n'est jamais public : sans signature, l'URL ne donne rien.
3. Le casque télécharge par plages d'octets, avec reprise sur coupure, puis
   vérifie l'empreinte SHA-256 **sur un fil d'exécution secondaire**.

> Le calcul d'empreinte doit impérativement rester hors du fil principal. Un
> SHA-256 sur 2 Go y gèle le rendu une cinquantaine de secondes, et Horizon OS
> retire alors le focus VR : écran noir, suivi de tête figé. C'est le bug corrigé
> en version 1.1.6, voir `BackendStorageContext.CanReuseLocalVideo`.

### À la suppression

Supprimer une vidéo dans le dashboard supprime aussi le fichier et sa miniature
dans R2. Sans cela, le stockage se remplirait d'orphelins invisibles.

## Configuration

Les mêmes quatre valeurs doivent exister à deux endroits.

**Secrets Supabase** — utilisés par les Edge Functions :

```bash
npx supabase secrets set --project-ref <ref> --env-file <fichier>
npx supabase secrets list --project-ref <ref>   # n'affiche que des empreintes
```

**`origin/.env`** — utilisé par les scripts locaux, jamais versionné :

```
R2_ENDPOINT=https://<id_de_compte>.r2.cloudflarestorage.com
R2_BUCKET=vr-cinema
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Les identifiants se créent dans le tableau de bord Cloudflare, via **R2 → Gérer
les jetons API**. Un jeton **« Lecture et écriture d'objets »** limité au bucket
suffit à l'exploitation courante ; le droit d'administration n'est nécessaire que
pour modifier la configuration CORS.

### CORS

Obligatoire, et la panne qu'il provoque est trompeuse : sans lui les octets
partent correctement, et c'est la **finalisation** de l'envoi qui échoue, parce
que le navigateur n'a pas le droit de lire l'en-tête `ETag` de chaque morceau.

```bash
node scripts/r2-cors.mjs          # applique la politique
node scripts/r2-cors.mjs --show   # affiche celle en place
```

Toute nouvelle adresse du dashboard doit être ajoutée dans la liste `ORIGINS` du
script, puis la politique réappliquée.

### Règles de cycle de vie

Le bucket doit conserver la règle **Default Multipart Abort Rule** (7 jours),
active par défaut à sa création : elle nettoie les envois interrompus, qui
occuperaient sinon de la place sans apparaître dans la liste des objets.

## Diagnostic

Quand un casque reste bloqué en téléchargement, commencer par là :

```bash
node scripts/r2-check.mjs                        # tout le bucket
node scripts/r2-check.mjs location/mon-film.mp4  # un seul objet
```

Le script signe une URL et demande réellement une plage d'octets, comme le
casque. Il distingue les cas que l'application confond :

| Réponse | Cause |
|---|---|
| `206` | tout va bien |
| `403` | identifiants faux, ou horloge de la machine trop décalée |
| `404` | l'objet n'est pas dans le bucket, mais la base y croit encore |
| pas de réponse | réseau ou bucket injoignable |

Si la signature elle-même est suspectée, `npx vitest run supabase/functions/_shared/r2.test.ts`
rejoue le vecteur de test officiel d'AWS : il échoue si l'algorithme est cassé.

## Sauvegarde

R2 est répliqué par Cloudflare, ce qui protège de la panne matérielle mais pas
d'une suppression par erreur. Pour une copie locale :

```bash
rclone sync R2:vr-cinema /chemin/de/sauvegarde --copy-links --progress
```

Les variables de connexion se chargent comme dans `scripts/migrate-to-r2.sh`.
Les métadonnées, elles, suivent les sauvegardes automatiques de Supabase.

## Historique : le nœud disque

Avant R2, les fichiers étaient servis par `origin/server.mjs` depuis un disque
local, exposé par un tunnel Cloudflare. Ce montage contournait la limite de 50 Mo
mais imposait de garder une machine allumée en permanence.

Le code correspondant est conservé : les vidéos en `origin = 'disk'` restent
lisibles, et une installation sans R2 configuré retombe dessus automatiquement.
Pour migrer un parc restant :

```bash
./scripts/migrate-to-r2.sh           # transfert puis vérification des tailles
./scripts/migrate-to-r2.sh --check   # vérification seule
```

Les chemins ne changent pas pendant la migration, seule la colonne `origin`
bascule. **Un casque déjà synchronisé ne retéléchargera rien** : depuis la
version 1.1.6, il valide ses fichiers locaux sur leur taille.
