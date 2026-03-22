
## Analyse du vrai problème

### Pourquoi les fake datas restent en Mode Réel

Le store `vrStore.ts` initialise TOUJOURS avec `DEMO_LIBRARIES`, `DEMO_DEVICES`, `DEMO_SYNC_LOGS` (ligne 362-364). Quand on passe en Mode Réel, `demoMode` change dans `settings` mais les listes `devices`, `libraries`, `syncLogs` contiennent encore les données de démo — elles ne sont jamais vidées.

Le `demoMode` actuel contrôle uniquement si les _actions_ (ADB, serveur) sont simulées ou réelles. Il ne vide pas les données fictives du store.

### Ce qu'il faut faire (3 points)

---

**A. Mode Réel = vider les données fictives**

Dans `Settings.tsx` : quand on bascule vers Mode Réel (`demoMode = false`), appeler immédiatement un `setRealModeData()` dans le store qui vide `devices`, `syncLogs`, et laisse `libraries` vide aussi (ou avec la structure vide sans vidéos).

Dans `vrStore.ts` : ajouter une action `setRealModeData()` qui remplace les données par des tableaux vides :
```ts
setRealModeData: () => set({
  devices: [],
  syncLogs: [],
  libraries: EMPTY_LIBRARIES, // même structure mais playlists vides
})
```

Et `loadDemoData()` (déjà dans le store) qui remet les DEMO_* — appelée quand on repasse en Mode Démo.

Côté `Settings.tsx`, le switch `onCheckedChange` doit appeler ces actions directement (sans attendre le Save) :
- Passage en Réel → `setRealModeData()` + `updateSettings({ demoMode: false })`
- Retour en Démo → `loadDemoData()` + `updateSettings({ demoMode: true })`

Effet immédiat : pas besoin de cliquer "Sauvegarder". L'utilisateur voit les casques disparaître instantanément quand il passe en Mode Réel — il sait qu'il doit en ajouter/détecter via ADB.

---

**B. Badge Mode dans le header DashboardLayout**

Dans `DashboardLayout.tsx`, ajouter un `DemoModeBadge` dans le header (entre `ServerModeBadge` et `NotificationBell`) :
- Lit `settings.demoMode` depuis `useVRStore`
- Mode Démo → badge orange `FlaskConical` + texte "Mode Démo"
- Mode Réel → badge vert `Zap` + texte "Mode Réel"
- Cliquable → navigue vers `/settings`

```tsx
function DemoModeBadge() {
  const { settings } = useVRStore();
  return (
    <Link to="/settings" className={cn(
      "hidden sm:flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border uppercase tracking-wider transition-colors",
      settings.demoMode
        ? "text-[hsl(35_90%_55%)] bg-[hsl(35_90%_55%_/_0.08)] border-[hsl(35_90%_55%_/_0.25)]"
        : "text-[hsl(140_70%_55%)] bg-[hsl(140_70%_40%_/_0.08)] border-[hsl(140_70%_40%_/_0.25)]"
    )}>
      {settings.demoMode ? <FlaskConical size={10}/> : <Zap size={10}/>}
      {settings.demoMode ? "Mode Démo" : "Mode Réel"}
    </Link>
  );
}
```

---

**C. Notifications in-app (toast) + historique dans la navbar**

**Dans le store** : ajouter un tableau `notifications: AppNotification[]` avec type :
```ts
interface AppNotification {
  id: string;
  at: string;
  title: string;
  body: string;
  type: "sync_done" | "sync_error" | "info";
  read: boolean;
}
```
Actions : `pushNotification(n)`, `markAllRead()`, `clearNotifications()`.

**Dans `Sync.tsx`** : après une sync terminée (réelle ou simulée), appeler `pushNotification` en plus du toast existant. Ça se fait déjà après `handleRealSync` et `handleSimulatedSync`.

**Dans `DashboardLayout.tsx`** : remplacer `NotificationBell` par une version qui lire aussi `notifications` du store — le badge count inclut les notifications non lues en plus des overdueDevices. Le dropdown affiche deux sections : "Alertes casques" (comme avant) + "Syncs récentes" (dernières notifications).

---

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/store/vrStore.ts` | + `setRealModeData()` + `AppNotification` type + `notifications[]` + `pushNotification` + `markAllRead` + `clearNotifications` |
| `src/pages/Settings.tsx` | Switch bascule immédiatement sans "Save" + appelle `setRealModeData` / `loadDemoData` |
| `src/components/dashboard/DashboardLayout.tsx` | + `DemoModeBadge` dans le header + `NotificationBell` étendu avec historique syncs |
| `src/pages/Sync.tsx` | + `pushNotification` après chaque sync terminée (réelle + simulée) |

### Comportement attendu

1. Aller dans Paramètres → basculer sur Mode Réel → les casques/logs disparaissent immédiatement
2. Le badge "Mode Réel" vert apparaît dans le header, cliquable pour revenir aux paramètres
3. Quand une sync se termine → toast Sonner + notification dans la cloche avec horodatage
4. Revenir en Mode Démo → les DEMO_* reviennent dans le store
