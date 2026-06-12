## Plan final v2 — diagnostic généralisé par casque ET par playlist

Objectif structurel : **toute modification d'une playlist doit bumper tous les casques qui dépendent de cette playlist, et seulement ceux-là.** Le diagnostic et les preuves couvrent les 4 chemins d'assignment (`headset` direct, `group`, `all`, multi-groupe avec dédup).

---

### 1. Migration unique — 2 fonctions de diagnostic + helper de comparaison

Toutes `SECURITY DEFINER`, `SET search_path = public, pg_temp`, garde admin en première instruction :
```sql
IF NOT public.has_role(auth.uid(), 'admin') THEN
  RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
END IF;
```
`GRANT EXECUTE … TO authenticated;` sur chaque fonction.

#### 1a. `diagnose_headset_sync(_headset_id uuid) RETURNS jsonb`
Identique au plan précédent : `headset`, `groups[]`, `assignments_effective[]`, `effective_playlists[]` (avec vidéos), `manifest_versions_recent[]`, `triggers_present`, `bump_dry_run`.

`bump_dry_run` : choisit une playlist effective, tente INSERT temporaire d'une vidéo absente, sinon UPDATE `position = position` sur une ligne existante. Wrap dans bloc `BEGIN/EXCEPTION` qui `RAISE EXCEPTION 'ROLLBACK_DIAGNOSE_OK'` pour annuler. Retourne `{ method, would_bump, before_desired, after_desired_inside_transaction, rolled_back, reason }`.

#### 1b. `diagnose_playlist_impact(_playlist_id uuid) RETURNS jsonb`
Nouvelle fonction. Retourne :
```jsonb
{
  "playlist": { "id", "name", "video_count" },
  "assignments": {
    "direct":  [{ "assignment_id", "headset_id", "headset_name" }],
    "group":   [{ "assignment_id", "group_id", "group_name", "members": [{ "headset_id", "headset_name" }] }],
    "all":     [{ "assignment_id" }]
  },
  "impacted_headsets": [
    { "headset_id", "headset_name", "status", "desired", "applied",
      "impact_paths": ["direct"] | ["group:<group_name>"] | ["all"] | ["group:A","group:B"],
      "group_ids": [...], "group_names": [...] }
    // dédupliqué par headset_id ; impact_paths contient TOUTES les voies d'impact
  ],
  "trigger_target_count":  <int>  // = SELECT count(*) FROM headsets_for_playlist(_playlist_id) — référence "source de vérité" du trigger
}
```

Règle clé : `impacted_headsets` est calculé par UNION dédupliquée des trois sources (direct / group members / all = tous les `headsets WHERE status='active'`). Filtré à `status='active'` pour matcher `headsets_for_playlist`. Si `trigger_target_count != len(impacted_headsets)` → la fonction inclut un champ `discrepancy: true` (signal d'alarme).

#### 1c. `diff_bump(_before jsonb, _after jsonb) RETURNS jsonb` (helper côté client)
Optionnel ; ou faire le diff côté JS. Plus simple côté JS.

### 2. Page Sync — boutons diagnostic admin

Dans `src/pages/Sync.tsx` :
- **Par casque** : bouton "Diag casque" → appelle `diagnose_headset_sync`, console + `<pre>`.
- **Nouvelle section "Diag playlist"** admin-only : sélecteur de playlist + bouton "Analyser impact" → appelle `diagnose_playlist_impact`, affiche `impacted_headsets` en tableau (headset, desired, applied, impact_paths) + alerte si `discrepancy`.

### 3. Logs frontend dans `src/pages/Playlists.tsx`

Wrapper unique `mutateAndVerify(playlistId, op)` qui :

1. `before = await supabase.rpc("diagnose_playlist_impact", { _playlist_id: playlistId })`
   → log `[PlaylistDebug] impacted_headsets_before=[{id,name,desired,applied,impact_paths}, …]`.
2. Log `[PlaylistDebug] toggling { playlist_id, playlist_name, video_id, video_name, op }`.
3. Mutation Supabase. En cas d'erreur : toast RLS clair via `isPermissionError`, **pas** de toast success, return.
4. Refetch ciblé `playlist_videos` (clé `playlist_id+video_id`) → `db_confirmed` booléen. Log `[PlaylistDebug] mutation result success=true db_confirmed=<bool>`.
5. Si `!db_confirmed` → toast "Mutation non confirmée par la base — réessayer", return.
6. `after = await supabase.rpc("diagnose_playlist_impact", { _playlist_id: playlistId })`
   → log `[PlaylistDebug] impacted_headsets_after=[…]`.
7. Diff côté JS :
   - `bumped` = headsets dont `desired_after > desired_before`.
   - `not_bumped` = headsets impactés dont `desired_after === desired_before`.
   - Log `[PlaylistDebug] bumped_headsets=[…]` et `[PlaylistDebug] not_bumped_headsets=[…]`.
8. Si `not_bumped.length > 0` → `toast.warning("Sync incomplète : N casque(s) impacté(s) n'ont pas bumpé. Voir console.")`. **Pas** de toast success "Vidéo ajoutée".
9. Sinon → `toast.success("Vidéo ajoutée/retirée — N casque(s) à resynchroniser.")`.

Helper `src/lib/supabaseErrors.ts` :
```ts
export function isPermissionError(err: { code?: string; message?: string }) {
  return err?.code === "42501" || /permission denied|row-level security|RLS/i.test(err?.message ?? "");
}
```

Même pattern appliqué à `toggleAssignment` (mais le diff `impacted_headsets` est calculé sur **deux playlists** si l'assignment change la cible — simplification : on log `before/after` de la playlist concernée par l'assignment toggle).

### 4. Logs renforcés dans `headset-manifest`

Un seul log structuré à la décision 304 vs 200 :
```ts
console.log(JSON.stringify({
  fn: "headset-manifest", phase: "decide",
  headset_id, known_version_raw, known_version_parsed: knownVersion,
  force_full: forceFull, desired_version: desiredVersion,
  will_return_304: !forceFull && Number.isFinite(knownVersion) && knownVersion === desiredVersion,
}));
```
Aucun changement de logique métier.

### 5. Hors scope — confirmé

- Pas d'`notify_playlist_changed` automatique.
- Pas de modification des triggers / `bump_headset_versions` / `headsets_for_playlist`.
- Pas de modification Unity.
- Pas de reset DB ni de suppression de données.

---

## Protocole de test final (A → D)

Chaque test livre : `playlist_id` modifié, `impacted_headsets_before/after`, `bumped`, `not_bumped`, snapshot SQL, et appel curl manifest pour AU MOINS un casque par chemin d'impact.

### Test A — assignment direct `target_type='headset'`
- Casque : `test emulate casque unity` (b67e0e14, assigné directement à 2 playlists).
- Modifier l'une de ces playlists (INSERT vidéo).
- Attendu : `impacted_headsets` = [b67e0e14], `bumped` = [b67e0e14], aucun autre casque touché.
- Vérification : `desired` du casque +1, snapshot v=N+1 dans `manifest_versions` après `curl …?known_version=N` → 200.

### Test B — assignment via `target_type='group'`
- Playlist : `video de la mer` (93bb2ea3), groupe `cae4324c` contenant 3 casques.
- Modifier la playlist (INSERT vidéo).
- Attendu : `impacted_headsets` = [Quest numero5, test emulate, test2 quest5] (tous status=active), `bumped` = mêmes 3.
- Vérification : `desired` +1 pour chacun, snapshot v=N+1 créé après premier `curl manifest` par casque.
- Appel `curl …?known_version=2` avec le DEVICE_TOKEN de test2 quest5 → **200**, `manifest_version: 3`, nouvelle vidéo dans `videos[]`.

### Test C — assignment `target_type='all'` (si présent)
- Si aucun assignment `all` n'existe : créer un temporaire via UI sur une playlist dédiée.
- Attendu : `impacted_headsets` = tous les `headsets WHERE status='active'`. `bumped` = idem.
- Cleanup : retirer l'assignment `all` après test.

### Test D — casque dans plusieurs groupes (déduplication)
- Ajouter test2 quest5 à un second groupe temporaire ; assigner ce groupe à `video de la mer`.
- Diag : `impacted_headsets` doit contenir test2 quest5 **une seule fois**, avec `impact_paths: ["group:cae4324c", "group:<temp>"]`.
- Modifier playlist (INSERT vidéo) : `desired` de test2 quest5 augmente de **1**, pas de 2 (le trigger reçoit un array dédupliqué — `bump_headset_versions` fait un seul UPDATE par headset_id).
- Cleanup groupe temporaire après test.

### Tests négatifs (intégrés à A et B)
- Pour chaque mutation, vérifier que les casques **non listés** dans `impacted_headsets_before` n'ont pas vu leur `desired` changer.

---

## Livrables finaux (sortie brute)

Pour chaque test A → D :
1. `playlist_id` réellement modifié (depuis `[PlaylistDebug] toggling`).
2. Sortie complète `impacted_headsets_before` et `impacted_headsets_after`.
3. Diff `bumped` / `not_bumped`.
4. SQL : `SELECT id, name, desired_manifest_version, applied_manifest_version FROM headsets WHERE id = ANY(<liste>);` avant et après.
5. Pour 1 casque par test : sortie curl `headset-manifest?known_version=<avant>` (status, ETag, `manifest_version`, présence/absence de la vidéo).
6. Sortie SQL des nouvelles lignes `manifest_versions` correspondantes.
7. Confirmation explicite "aucun casque hors impacted_headsets n'a vu son desired changer" (SQL global avant/après sur tous les casques actifs).