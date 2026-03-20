
## Two features to build

### Feature 1 — Modale vidéo avancée (VideoPreviewModal.tsx)

**3 additions to the existing modal:**

1. **Résolution estimée** — new metadata tile:
   - `360°` → `4K (3840 × 2160)`
   - `180°` → `8K (7680 × 4320)`
   - Add a `Monitor` or `Sparkles` icon, in violet for 8K, cyan for 4K

2. **Timeline de lecture simulée** — animated progress bar in the preview area:
   - Uses `useState` + `useEffect` + `setInterval` to auto-advance a `progress` (0–100) value every ~300ms
   - Plays forward, then resets (loop)
   - Show: play/pause toggle button, current time (computed from `video.duration`), total duration
   - Styled as a dark bar with a violet fill + glow

3. **Bouton "Copier le chemin"** — small button in the header area:
   - Computes the file path: `settings.videoStoragePath + "/" + video.name` from the store
   - `navigator.clipboard.writeText(...)` on click
   - Shows a ✓ checkmark for 1.5s then reverts to the copy icon
   - Uses `Copy` and `Check` icons from lucide-react

Files to change:
- `src/components/dashboard/VideoPreviewModal.tsx` — add all 3 features
- `src/store/vrStore.ts` — no change needed (settings path already available)
- VideoPreviewModal already takes `video` prop, just needs `settings.videoStoragePath` — add `useVRStore` import

---

### Feature 2 — Page Statistiques (/stats)

New page `src/pages/Stats.tsx` using Recharts (already installed).

**4 charts/stats blocks:**

1. **Donut chart — Répartition 360/180** (per library + combined)
   - Two small donuts side by side: Location | Animations
   - Data computed from `libraries` store
   - Colors: violet = 360°, cyan = 180°
   - Use `PieChart` + `Pie` + `Cell` from recharts

2. **Bar chart — Évolution des syncs sur 30 jours**
   - X axis: last 30 days (grouped by day)
   - Y axis: number of files pushed
   - Data: derive from `syncLogs` — group `videosPushed` by date
   - Use `BarChart` + `Bar` + `XAxis` + `YAxis` + `Tooltip`
   - Color: violet bars

3. **Stat card — Casque le plus synchronisé**
   - Count how many sync logs reference each device ID
   - Show top device: name, serial, sync count
   - Simple styled card, no chart

4. **Stat card — Total des données transférées**
   - Sum `videosPushed × average video size` estimate across all success logs
   - Or: compute from libraries total video sizes as an indicator
   - Show in GB with a HardDrive icon

Layout: 2-column grid on desktop, 1-column on mobile.

Register route in `src/App.tsx` and add nav item to `DashboardLayout.tsx`.

**Files to create/modify:**
1. `src/pages/Stats.tsx` — new page (recharts, 4 sections)
2. `src/App.tsx` — add `/stats` route + import
3. `src/components/dashboard/DashboardLayout.tsx` — add `{ to: "/stats", label: "Statistiques", icon: BarChart2 }` nav item + PAGE_TITLES entry
