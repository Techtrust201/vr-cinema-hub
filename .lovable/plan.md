# Plan — Synchronisation OTA des casques (sans PC branché)

## Objectif
Tes casques Quest, déployés chez les clients finaux partout en France, doivent récupérer automatiquement les nouvelles vidéos via leur propre WiFi, sans ADB, sans PC, sans intervention humaine. Toi et ton client uploadez depuis le dashboard web → tous les casques concernés se mettent à jour seuls.

## Architecture cible

```text
┌───────────────────┐         ┌──────────────────────┐         ┌────────────────────┐
│  Dashboard web    │  upload │   Lovable Cloud      │  pull   │  App Unity VR      │
│  (toi + client)   ├────────►│  (DB + Storage +     │◄────────┤  sur chaque Quest  │
│                   │         │   Edge Functions)    │         │  (chez clients)    │
└───────────────────┘         └──────────────────────┘         └────────────────────┘
                                       ▲                                │
                                       └────── heartbeat + statut ──────┘
```

- **Le casque pilote sa sync**, pas l'inverse. Au boot et toutes les X minutes : il appelle l'API, voit ce qu'il doit avoir, télécharge ce qui manque, supprime ce qui n'est plus assigné, remonte son statut.
- **Pairing par code à 6 chiffres** : à la 1ʳᵉ ouverture de l'app Unity, le casque affiche un code, le client (ou toi) le tape dans le dashboard → casque enrôlé, plus jamais à refaire.
- **Tolérance offline** : si pas de WiFi, le casque réessaie en backoff. Le dashboard affiche "vu il y a 2h / 3 jours / hors-ligne" pour que tu repères les casques en panne.

## Concepts métier introduits

| Concept | Rôle |
|---|---|
| **Headset** | Un casque enrôlé (1 ligne par Quest physique). Remplace l'ancienne table `devices` orientée ADB. |
| **Pairing code** | Code temporaire 6 chiffres généré par le casque, consommé par le dashboard pour lier le casque à ton workspace. |
| **Playlist** | Groupe de vidéos. Tu peux assigner une playlist à 1 casque, à un groupe de casques, ou à tous. |
| **Assignment** | Lien playlist ↔ casque (ou groupe). Le casque calcule "ce que je dois avoir" à partir de ses assignments. |
| **Sync report** | Ce que le casque remonte : vidéos présentes, espace dispo, version app, batterie, dernière sync OK/KO. |

## Phase 2 — Backend OTA (cette étape)

### Schéma DB ajouté
- `headsets` (id, workspace, name, serial, model, pairing_status, last_seen_at, storage_free_bytes, battery, app_version)
- `headset_groups` + `headset_group_members`
- `playlists` + `playlist_videos`
- `assignments` (playlist_id, target_type 'headset'|'group'|'all', target_id)
- `pairing_codes` (code 6 chiffres, expires_at 10 min, claimed_by_headset_id)
- `sync_reports` (headset_id, started_at, finished_at, downloaded_count, failed_count, error_message)

### Edge Functions (API publique consommée par le casque)
1. `headset-pair-init` → casque demande un code, reçoit `{code, expires_at}`
2. `headset-pair-claim` → dashboard appelle avec le code + nom du casque → crée la ligne `headsets`, renvoie un **device token** longue durée
3. `headset-manifest` → casque envoie son device token → reçoit la liste des vidéos qu'il doit avoir + URLs signées de téléchargement (15 min)
4. `headset-heartbeat` → casque ping toutes les 5 min avec son état (batterie, stockage, app version)
5. `headset-report-sync` → casque pousse le résultat de sa dernière sync

Toutes ces functions valident le **device token** (JWT custom signé par une clé Cloud), pas l'auth user. Comme ça le casque n'a pas besoin de compte email.

### Stockage Phase 2
On reste sur le bucket `videos` de Lovable Cloud. Les URLs signées suffisent — pas de blocage CORS côté Quest car Unity utilise UnityWebRequest, pas un navigateur. Migration vers Backblaze prévue Phase 3 quand le volume grossit (le code des edge functions sera la seule chose à changer).

## Phase 2 — Dashboard web (UI ajoutée)

- **Page "Casques"** (remplace l'ancienne `Devices`)
  - Liste avec : nom, dernière sync, statut (en ligne / hors-ligne / sync en cours / erreur), stockage restant, batterie, version app
  - Action "Appairer un nouveau casque" → modal qui demande le code 6 chiffres + nom à donner
  - Action sur chaque casque : renommer, voir historique sync, retirer (révoque le token)
- **Page "Groupes"** (nouvelle)
  - Créer un groupe, glisser-déposer casques dedans
- **Page "Playlists"** (nouvelle)
  - Créer playlist, ajouter vidéos depuis la bibliothèque, drag-and-drop pour ordonner
  - Assigner à : un casque / un groupe / tout le monde
- **Page "Suivi sync"** (remplace l'ancienne `Sync`)
  - Vue temps réel (Supabase Realtime) des rapports : qui a fini, qui est en cours, qui a échoué et pourquoi
  - Alertes : casques pas vus depuis > 24h surlignés rouge

## Phase 3 — App Unity VR (livrable séparé)

Tu as déjà un player Unity (Skybox-clone). On lui ajoute un **module SyncManager** :

1. Au boot : si pas de device token stocké → afficher écran de pairing avec code
2. Si token présent : appeler `headset-manifest`, comparer avec vidéos locales, télécharger ce qui manque dans `/sdcard/Android/data/<package>/files/videos/`, supprimer ce qui n'est plus assigné
3. Toutes les 5 min en background : heartbeat
4. Retry exponentiel si offline (1 min → 5 → 30 → 2h)
5. UI minimaliste : badge "sync en cours" dans le menu, écran erreur si problème

Je ne peux pas écrire du C# Unity ici (ce sandbox est web). Je te livrerai :
- Le **contrat API complet documenté** (curl examples, JSON schemas)
- Un **script C# de référence** (`SyncManager.cs`) prêt à coller dans ton projet Unity, que tu adapteras à ton UI existante
- Les instructions de packaging APK signé

## Sécurité
- Device tokens = JWT signés HS256 avec un secret stocké dans Lovable Cloud, durée 1 an, révocables
- Rate limiting basique côté edge functions (60 req/min/casque)
- Pairing codes : 10 min de validité, 1 seule utilisation, brute-force-proof (lockout après 5 essais)
- RLS strict : un casque ne voit que son manifest, jamais ceux des autres

## Ce qu'on garde, ce qu'on jette

**Gardé** : tables `videos`, `profiles`, `user_roles`, bucket `videos`, page Bibliothèques, auth.

**Refactoré** : `devices` → `headsets`, `sync_jobs` → `sync_reports`. L'ancien code Electron/ADB devient optionnel (mode "local debug" pour quand un casque est physiquement à côté de toi).

**Abandonné** : tunnels ngrok, port unifié 3001, X-Auth-Token middleware — plus pertinents avec une archi cloud.

## Découpage de livraison

1. **Migration DB** : nouveau schéma headsets/playlists/assignments/pairing/reports (1 migration)
2. **Edge functions** : les 5 endpoints listés
3. **UI dashboard** : Casques + Groupes + Playlists + Suivi sync (Realtime)
4. **Doc API + SyncManager.cs Unity** : livré en fin de phase pour intégration côté Unity

Tu valides ce plan et je commence par la migration DB ?
