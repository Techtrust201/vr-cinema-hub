
## Problèmes identifiés et corrections à apporter

### Bug critique #1 — Ref sur composant fonctionnel (console error)
`VideoRow` reçoit une `ref` quelque part — probablement via un composant Radix UI (`Tooltip`, `Button` shadcn) qui wrappait un composant fonctionnel sans `forwardRef`. Il faut revoir `VideoRow` pour éviter ça. En réalité le `fileRef` dans `PlaylistAccordion` est sur un `<input>` natif — pas de problème là. Le vrai bug est que `VideoRow` et `PlaylistAccordion` sont des fonctions locales dans `Libraries.tsx`, et React avertit qu'une ref a été passée à un function component. Correction : `VideoRow` doit devenir `React.forwardRef` ou s'assurer qu'aucune ref n'est transmise implicitement.

### Bug #2 — Sync : les logs en cours ne s'accumulent pas correctement
Dans `handleSync`, la closure sur `newLog.lines` est stale — les mises à jour intermédiaires écrasent toujours les mêmes `lines` au lieu de les accumuler. Résultat : les logs de progression n'apparaissent pas correctement.

### Bug #3 — Edition format vidéo manquante
L'utilisateur doit pouvoir modifier le format (360°/180°) et le mode stéréo d'une vidéo existante. `VideoRow` ne propose pas cette fonctionnalité. Il faut ajouter un menu ou des boutons inline pour modifier `format` et `stereo`.

### Bug #4 — `updateVideo` manquant dans le store
Le store `vrStore.ts` n'expose pas de méthode `updateVideo`. Il faut l'ajouter pour supporter l'édition de format/stéréo.

### Bug #5 — Renommage d'appareil et assignation type manquants
Sur la page Casques, aucun moyen de renommer un casque ou de changer son type (Location / Animations). Il faut ajouter ces actions dans `DeviceCard`.

### Bug #6 — `updateDevice` manquant dans le store
Il faut ajouter `updateDevice` au store pour permettre le renommage et le changement de type.

### Bug #7 — `addDevice` / `removeDevice` manquants
La page Casques ne permet pas d'ajouter manuellement un casque (avec son IP / serial) ni d'en supprimer. Il faut ajouter ces fonctionnalités.

### Bug #8 — Sync : `lastSyncAt` des devices non mis à jour après sync
Après une sync réussie, les `Device.lastSyncAt` du store ne sont pas mis à jour. Il faut le faire dans `handleSync` via `updateDevice`.

### Améliorations fonctionnelles à apporter

**Libraries page**
- Ajouter `updateVideo` au store (format + stereo)
- Ajouter des boutons inline sur `VideoRow` pour éditer format/stéréo avec sauvegarde immédiate
- Ajouter le renommage d'une playlist (double-clic sur le nom)
- Corriger le warning ref en déplaçant `VideoRow` hors du composant ou en utilisant `forwardRef`

**Devices page**
- Ajouter `updateDevice` et `removeDevice` au store
- Ajouter un bouton "Supprimer" sur chaque `DeviceCard`
- Ajouter un bouton/modal "Ajouter un casque manuellement" (avec nom, serial, type, IP)
- Permettre de modifier le nom et le type directement sur la card

**Sync page**
- Corriger la closure stale sur les logs (utiliser un ref ou la fonction updater de setState)
- Mettre à jour `lastSyncAt` des devices après sync réussie
- Ajouter un bouton "Vider l'historique" sur les logs

**Store**
- Ajouter : `updateVideo(libraryId, playlistId, videoId, updates)`
- Ajouter : `updateDevice(deviceId, updates)`
- Ajouter : `addDevice(device)`
- Ajouter : `removeDevice(deviceId)`
- Ajouter : `clearSyncLogs()`
- Ajouter : `renamePlaylist(libraryId, playlistId, newName)`

## Fichiers à modifier
1. `src/store/vrStore.ts` — Ajouter les 6 nouvelles actions
2. `src/components/dashboard/VideoRow.tsx` — Ajouter édition format/stéréo inline + corriger le warning ref
3. `src/components/dashboard/DeviceCard.tsx` — Ajouter renommage, changement de type, suppression
4. `src/pages/Libraries.tsx` — Connecter `updateVideo` + `renamePlaylist`, corriger ref warning
5. `src/pages/Devices.tsx` — Ajouter modal "Nouveau casque", boutons de suppression
6. `src/pages/Sync.tsx` — Corriger closure stale, mettre à jour `lastSyncAt`, ajouter "Vider historique"
