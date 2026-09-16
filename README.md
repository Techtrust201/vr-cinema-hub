# VR Cinema Hub

Diffusion de films VR sur une flotte de casques Meta Quest. Un tableau de bord
web pour gérer le contenu, une application Unity dans les casques, et une
synchronisation automatique entre les deux.

Les casques lisent **hors ligne** : une fois synchronisés, ils n'ont plus besoin
de réseau. C'est la contrainte qui a façonné toute l'architecture.

## Par où commencer

| Vous êtes… | Lisez |
|---|---|
| exploitant du parc | [Guide de l'exploitant](docs/GUIDE_EXPLOITANT.md) |
| chargé de mettre un casque en service | [Mise en service d'un casque](docs/HEADSET_ONBOARDING.md) |
| en train de reprendre le code | la suite de ce fichier, puis [Architecture](docs/ARCHITECTURE.md) |
| confronté à une panne | [Dépannage](docs/TROUBLESHOOTING.md) et [Runbook](docs/OPERATIONS_RUNBOOK.md) |

## Les quatre morceaux

```
  Tableau de bord            Supabase                 Cloudflare R2
  (React, sur Vercel)   ┌──  Postgres + Edge      ──  fichiers vidéo
         │              │    Functions (Deno)          (bucket privé)
         └── envoi ─────┤         │                         │
                        │         │ manifeste               │ URL signées
  Application Unity ────┘         │ signé                   │ (6 h)
  (casque Quest 3)  ←─────────────┘                         │
         └──────────── téléchargement direct ───────────────┘
```

**Le tableau de bord** gère films, playlists, casques et attributions. Il
n'entrepose rien lui-même : les fichiers partent directement vers le stockage
objet, par envoi découpé et signé.

**Supabase** porte la base de données, l'authentification et neuf Edge
Functions. C'est lui qui décide ce que chaque casque doit afficher, et qui signe
les accès aux fichiers. Aucun casque ne reçoit jamais d'identifiant de stockage.

**Cloudflare R2** stocke les vidéos. Le bucket est privé ; tout accès passe par
une URL signée à durée limitée. Voir [Stockage](docs/STOCKAGE.md) pour les
coûts, la configuration et le diagnostic.

**L'application Unity** (dépôt imbriqué `vr-cinema-quest-app-unity/`, indépendant
de celui-ci) interroge son manifeste, télécharge ce qui lui manque, vérifie
l'empreinte de chaque fichier, puis lit hors ligne.

## Comment un film arrive dans un casque

1. Le navigateur calcule l'empreinte SHA-256 du fichier en flux, sans le charger
   en mémoire, et vérifie que le codec est lisible par le casque.
2. `origin-upload-url` accorde une autorisation d'écriture signée. **C'est le
   serveur qui choisit le stockage**, jamais le navigateur : il n'y a donc aucune
   variable d'environnement à synchroniser entre Vercel et Supabase.
3. Au-delà de 32 Mo, l'envoi est découpé en morceaux signés séparément ; une
   coupure ne fait perdre que le morceau en cours.
4. Modifier un film, une playlist, une attribution ou un groupe incrémente la
   version de contenu des casques concernés — c'est un déclencheur en base, pas
   du code applicatif, donc rien ne peut l'oublier.
5. Le casque appelle `headset-manifest` avec son jeton, reçoit des URL signées
   valables six heures, télécharge par plages d'octets et vérifie chaque
   empreinte **hors du fil principal** (sinon Horizon OS retire le focus VR et
   l'écran devient noir).
6. Il renvoie un compte rendu via `headset-report-sync`, visible dans la page
   Synchronisation.

Le contrat détaillé est dans [SYNC_CONTRACT.md](docs/SYNC_CONTRACT.md), les
points d'entrée dans [API.md](docs/API.md).

## Développement

```bash
npm install
npm run dev      # http://localhost:8080
npm test         # 137 tests
npm run lint
```

Les variables nécessaires sont décrites dans `.env.example`. Les identifiants de
stockage ne sont **pas** des variables du front : ils vivent dans les secrets
Supabase et dans `origin/.env`, jamais dans un fichier versionné. Voir
[ENVIRONMENTS.md](docs/ENVIRONMENTS.md).

### Déployer

```bash
npx vercel --prod --yes                                    # tableau de bord
npx supabase functions deploy <nom> --project-ref <ref>    # une Edge Function
```

## Où se trouve quoi

| Chemin | Rôle |
|---|---|
| `src/pages/` | Les treize pages : Libraries, Playlists, Headsets, Groups, Sync, Stats… |
| `src/lib/objectStore.ts` | Envoi, suppression et lecture des fichiers, quel que soit le stockage |
| `src/lib/probeVideoFile.ts` | Contrôle du codec avant envoi, en lisant les en-têtes du fichier |
| `src/lib/syncVocabulary.ts` | Traduction du vocabulaire interne vers des phrases lisibles |
| `supabase/functions/_shared/r2.ts` | Signature AWS SigV4, écrite à la main pour Deno |
| `supabase/functions/headset-*` | Appairage, manifeste, comptes rendus, battement de cœur |
| `supabase/migrations/` | Schéma, politiques d'accès et déclencheurs |
| `scripts/` | Migration du stockage, contrôle d'accès R2, configuration CORS |
| `origin/` | Ancien serveur de fichiers local, conservé comme solution de repli |

## Choix qui méritent une explication

**Pourquoi pas Supabase Storage ?** L'offre gratuite plafonne à 50 Mo par
fichier. Un film VR pèse entre 300 Mo et 1 Go.

**Pourquoi R2 plutôt que S3 ?** Chaque casque télécharge sa propre copie
intégrale. Cinquante casques et dix films représentent environ 300 Go de trafic
sortant par déploiement : gratuit sur R2, une trentaine de dollars par mois sur
S3.

**Pourquoi la validation des fichiers locaux se fait sur la taille et non sur
l'empreinte ?** Recalculer un SHA-256 sur 2 Go au démarrage gelait le rendu une
cinquantaine de secondes, et Horizon OS retirait le focus VR. L'empreinte est
vérifiée une fois, au téléchargement ; ensuite la taille suffit.

**Pourquoi un contrôle du codec côté navigateur ?** Un fichier VP9 ou AV1
traverse tout le système sans erreur et donne un écran noir sur le casque, sans
le moindre message. Le détecter avant l'envoi est la seule façon d'obtenir un
diagnostic compréhensible.

## Tests

`npm test` couvre la logique sensible : signature des accès au stockage
(rejouée contre le vecteur de test officiel d'AWS), déduction du format d'après
le nom de fichier, analyse des en-têtes vidéo, traduction du vocabulaire, calcul
des écarts d'attribution.

Deux scripts vérifient le monde réel plutôt que des simulations :

```bash
node scripts/r2-check.mjs                        # accès réel aux fichiers stockés
npx vite-node scripts/probe-real-files.mts       # analyse comparée à ffprobe
```
