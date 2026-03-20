
## Analysis

The codebase is clean and well-structured. I need to add 3 features + fix/verify the existing sync logic:

1. **Page Paramètres** (`/settings`) — storage path, max upload size, auth token, reset store
2. **Notification system in DashboardLayout header** — connected badge, 7-day warning, last sync
3. **Video preview modal in Libraries** — click on video opens HTML5 player modal with metadata
4. **The sync logs accumulation is already fixed** (uses `linesRef`) — just needs verification via test

## Plan

### 1. Settings page — `src/pages/Settings.tsx` (new)
- Local state for 3 config fields: `videoStoragePath`, `maxUploadGB`, `authToken`
- Persisted in a new `settings` slice of the Zustand store (add `VRSettings` interface)
- "Réinitialiser les données" button: calls a new `resetStore()` action with a confirmation step
- Visual: 3 input fields with labels + description, reset button in a red danger zone card

### 2. Extend vrStore — `src/store/vrStore.ts`
- Add `settings: VRSettings` to the store state
- Add `updateSettings(updates: Partial<VRSettings>)` action
- Add `resetStore()` action that resets libraries, devices, syncLogs to their initial mock values

### 3. Notification bell in DashboardLayout — `src/components/dashboard/DashboardLayout.tsx`
- Add a persistent top header bar (not just mobile) with the notification area
- Show a bell icon with badge count in the sidebar footer or header
- Notifications computed from store:
  - Count of connected devices → green badge
  - Devices not synced in 7+ days (or `lastSyncAt === null`) → orange warning
  - Last global sync timestamp
- Use a small dropdown panel on click (no external library, custom)

### 4. Video preview modal — `src/components/dashboard/VideoPreviewModal.tsx` (new)
- Opens when user clicks anywhere on a `VideoRow` (not on the action buttons)
- Contains: `<video>` HTML5 player (src will be empty/placeholder since files aren't real), metadata display
- Since videos are simulated (no real file URL), show a "Aperçu non disponible" placeholder with the video icon, but still display all metadata nicely
- Displays: name, format, stereo, size, duration, addedAt
- VideoRow needs a new `onPreview` callback prop

### 5. Route — `src/App.tsx`
- Add `/settings` route
- Add `Settings` nav item to DashboardLayout sidebar with `Settings` icon

### Files to change:
1. `src/store/vrStore.ts` — add `VRSettings`, `updateSettings`, `resetStore`
2. `src/pages/Settings.tsx` — new page
3. `src/App.tsx` — add `/settings` route
4. `src/components/dashboard/DashboardLayout.tsx` — add Settings nav item + persistent header with notifications
5. `src/components/dashboard/VideoPreviewModal.tsx` — new modal component
6. `src/components/dashboard/VideoRow.tsx` — add `onPreview` prop + click handler on the row body
7. `src/pages/Libraries.tsx` — wire `onPreview` to open `VideoPreviewModal`

### Header notification design
The sidebar footer gets replaced with a proper bottom section. A persistent topbar is added to the main content area (always visible, not just mobile) with:
- Left: page title (auto from route)
- Right: notification bell icon with badge + connected count chip

The notification dropdown shows:
- Connected devices count with green indicator
- List of devices overdue for sync (>7 days or never synced)  
- Last successful sync timestamp

This keeps the sidebar clean and adds value to every page.
