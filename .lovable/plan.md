
## What the user wants

Four things combined in one message:

1. **Test the "Préparer Wi-Fi" button** — this is a real-world action they need to do themselves (plug in USB, run `npm run dev:all`). I cannot test hardware from the browser preview, but I can verify the button is visible/working in the UI.

2. **Real-time sync logs via SSE** — replace `execSync` with `spawn` in the server, add a `GET /api/sync/stream` SSE endpoint, update `Sync.tsx` to use `EventSource`.

3. **Auto-detect headset IP** — add `GET /api/device-ip/:serial` in the server (reads `adb shell ip route`), pre-fill the IP in `WifiConnectModal`.

4. **360°/180° immersive player in VideoPreviewModal** — integrate A-Frame for a spherical video viewer with a flat/360° toggle.

### Analysis of current state

**Sync streaming**: Currently `handleSync` in `sync-server.js` uses `execSync` for each `adb push` and only returns when the full operation is done. The frontend does a fake progress interval. This is fine for small files but blocks on large files and gives zero real feedback.

**IP detection**: `WifiConnectModal` has a manual IP input. The server has no endpoint to read the device's IP. `adb shell ip route` gives us the Wi-Fi IP quickly.

**360° player**: `VideoPreviewModal` uses a standard `<video>` element with `object-contain`. A-Frame (`aframe`) would add a full WebGL sphere. But `aframe` has known React integration issues and adds ~300KB. A lighter approach: use `@react-three/fiber` + `@react-three/drei` (already in the codebase context) to render a VideoTexture on a sphere — this is much cleaner in React.

Actually, reading the context: `@react-three/fiber@^8.18` and `@react-three/drei@^9.122.0` are the recommended packages. These aren't installed yet but are supported. Let me use this approach — it's React-native, no global side effects, and the docs confirm exact versions.

### Plan

**1. Real-time sync logs (SSE)**

In `server/sync-server.js`:
- Add `GET /api/sync/stream` endpoint using Server-Sent Events
- Job system: `POST /api/sync` now returns a `{ jobId }` immediately
- `GET /api/sync/stream/:jobId` streams `data:` events line by line
- Actually simpler approach: keep `POST /api/sync` but switch from `execSync` to `spawn` for `adb push` and stream stdout/stderr as SSE on the same `POST` response using chunked transfer — OR — use a job queue pattern.

The cleanest pattern for SSE with Express: 
- `POST /api/sync/start` → returns `{ jobId }` and starts an async job
- `GET /api/sync/stream/:jobId` → SSE stream that emits lines as the job runs

In `src/lib/serverApi.ts`: add `startSync()` returning `{ jobId }` and `createSyncStream(jobId)` returning `EventSource`.

In `Sync.tsx`: replace the `pushSync` loop with `startSync` + `EventSource` listener that appends lines in real time.

**2. Auto-detect IP**

In `server/sync-server.js`:
- Add `GET /api/device-ip/:serial` → runs `adb -s SERIAL shell ip route` and parses the Wi-Fi IP (typically `wlan0`).

In `src/lib/serverApi.ts`:
- Add `fetchDeviceIp(serial, baseUrl?)`.

In `src/pages/Devices.tsx` (`WifiConnectModal`):
- Add `initialIp` prop to `WifiConnectModal`
- In `DeviceCard`'s `onPrepareWifi` success handler: after `tcpip 5555`, auto-fetch the IP and open the `WifiConnectModal` pre-filled.
- Or: add a "Détecter IP" button inside `WifiConnectModal`.

Simpler and more useful: after `handlePrepareWifi` succeeds, automatically call `fetchDeviceIp` and open `WifiConnectModal` with the IP pre-filled. This is the best UX — one click does everything.

**3. 360°/180° player**

Add `@react-three/fiber@^8.18` and `@react-three/drei@^9.122.0` and `three@^0.177.0` to dependencies.

In `VideoPreviewModal`:
- Add a toggle button "Mode plat / Mode 360°"
- When "Mode 360°" and server connected: render a Three.js canvas with a sphere (`<mesh>` with `SphereGeometry` inverted normals) textured with the video element via `VideoTexture`
- OrbitControls from Drei for drag-to-look interaction
- Toggle back to flat restores the standard `<video>` element

This is the most complex change. The modal currently is `max-w-lg` — for the 360° player we might want a larger container. We can expand the modal width when 360° mode is active.

### Files to modify

1. `server/sync-server.js` — add SSE job streaming (`/api/sync/start` + `/api/sync/stream/:jobId`) + `/api/device-ip/:serial`
2. `src/lib/serverApi.ts` — add `startSync`, `createSyncStream`, `fetchDeviceIp`
3. `src/pages/Sync.tsx` — use SSE for real-time log lines (replace `pushSync` loop with `startSync` + `EventSource`)
4. `src/pages/Devices.tsx` — after `prepareTcpip` succeeds, fetch IP and open WifiConnectModal pre-filled; `WifiConnectModal` accepts `initialIp`
5. `src/components/dashboard/VideoPreviewModal.tsx` — add 360° Three.js player toggle
6. `package.json` — add `@react-three/fiber`, `@react-three/drei`, `three`

### Concretely for SSE streaming

Server job map approach:
```js
const jobs = new Map(); // jobId → { lines: [], done: false, clients: Set<res> }

POST /api/sync/start → creates jobId, starts async spawn-based sync, returns { jobId }
GET /api/sync/stream/:jobId → SSE, sends buffered lines + live updates
```

Each `adb push` is replaced with `spawn('adb', ['-s', serial, 'push', local, remote])` — stdout/stderr lines pushed to job listeners.

### Concretely for 360° player

```tsx
// Three.js sphere with inverted normals + VideoTexture
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

function VR360Sphere({ videoEl }: { videoEl: HTMLVideoElement }) {
  const texture = new THREE.VideoTexture(videoEl)
  return (
    <mesh>
      <sphereGeometry args={[5, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  )
}
```

The video element is shared between the HTML5 player and the Three.js texture. The toggle just swaps which rendering mode is active.

### Summary

4 independent features, all well-defined. Tackle them in order of complexity:
1. IP auto-detect (simplest — 1 server endpoint + small UI change)
2. SSE streaming (medium — server job system + EventSource in frontend)  
3. 360° player (complex — new packages + Three.js canvas)
4. "Préparer Wi-Fi" test note — already implemented, I'll add a small UX improvement: after tcpip success, immediately fetch IP and open the Wi-Fi modal pre-filled.

---

## Présentation du plan

### 4 fonctionnalités à implémenter

**A. Détection automatique de l'IP du casque**
- `server/sync-server.js` : ajouter `GET /api/device-ip/:serial` → exécute `adb -s SERIAL shell ip route | grep wlan0` et retourne l'IP Wi-Fi
- `src/lib/serverApi.ts` : ajouter `fetchDeviceIp(serial, baseUrl?)`
- `src/pages/Devices.tsx` : après `prepareTcpip` succès → appel `fetchDeviceIp` → ouverture auto de `WifiConnectModal` avec IP pré-remplie

**B. Streaming de logs en temps réel (SSE)**
- `server/sync-server.js` : ajouter `POST /api/sync/start` (crée un job, démarre `spawn` en arrière-plan, retourne `{ jobId }`) + `GET /api/sync/stream/:jobId` (SSE qui émet les lignes en temps réel via un Map de jobs)
- `src/lib/serverApi.ts` : ajouter `startSync()` et `createSyncStream(jobId)`
- `src/pages/Sync.tsx` : remplacer `pushSync` + faux interval de progression par `startSync` + `EventSource` qui ajoute les lignes une par une en direct

**C. Player 360°/180° immersif**
- Ajouter `@react-three/fiber@^8.18`, `@react-three/drei@^9.122.0`, `three@^0.177.0` dans `package.json`
- `src/components/dashboard/VideoPreviewModal.tsx` : bouton toggle "Plat / 360°" visible quand serveur connecté — en mode 360°, remplace la `<video>` par un canvas Three.js avec une sphère inversée (`THREE.BackSide`) texturée par le flux vidéo + `OrbitControls` pour pivoter à la souris

**D. UX Préparer Wi-Fi** (bonus déjà prévu dans l'analyse)
- Dans `handlePrepareWifi` de `Devices.tsx` : enchaîne automatiquement `fetchDeviceIp` après `tcpip 5555` et ouvre `WifiConnectModal` avec l'IP — une seule action fait tout

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `server/sync-server.js` | + `/api/device-ip/:serial` + `/api/sync/start` + `/api/sync/stream/:jobId` |
| `src/lib/serverApi.ts` | + `fetchDeviceIp`, `startSync`, `createSyncStream` |
| `src/pages/Sync.tsx` | Remplace `pushSync` + faux interval → `startSync` + `EventSource` |
| `src/pages/Devices.tsx` | Auto-open WifiModal avec IP après tcpip + `WifiConnectModal` accepte `initialIp` |
| `src/components/dashboard/VideoPreviewModal.tsx` | Toggle 360° + canvas Three.js |
| `package.json` | + `@react-three/fiber`, `@react-three/drei`, `three` |
