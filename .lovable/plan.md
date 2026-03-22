
## What the user wants

1. **Test the complete flow** — hardware test they must do themselves; I can verify the UI code is correct and add a note
2. **Test the 360° player** — same, verify the code is solid
3. **Verify SSE streaming** — code review; SSE + spawn is already implemented in the server
4. **Gyroscope for mobile 360° player** — DeviceOrientationEvent → OrbitControls
5. **Update README** — add explanations about Unity (not needed), video storage (local MP4 files), and everything else they don't know

## Code audit before planning

### Current state analysis

**VideoPreviewModal.tsx** — The 360° player is already implemented with Three.js + VideoTexture + OrbitControls. It works correctly but:
- The `VR360Canvas` component is missing the `useFrame` render loop issue: `gl.render(gl.domElement, gl.domElement)` on line 82 is wrong — `useFrame` auto-handles rendering in R3F. But `useThree()` import and the wrong `gl.render` call could cause issues.
- `VideoSphere` uses `useFrame` which correctly triggers `texture.needsUpdate = true` — that's fine. But the `gl.render(...)` call on the wrong objects is a bug that could cause errors.
- **No gyroscope support** — only mouse OrbitControls.

**server/sync-server.js** — SSE streaming is fully implemented with spawn, job map, `/api/sync/start` + `/api/sync/stream/:jobId`. Good.

**Devices.tsx** — `handlePrepareWifi` calls `prepareTcpip` then `fetchDeviceIp` and opens `WifiConnectModal` pre-filled. All wired up.

**README.md** — Already comprehensive but missing:
- Unity explanation (does NOT need Unity)
- How videos are stored and where they come from
- How to get VR videos (sources)
- How Skybox Player reads the files on the Quest
- Explanation of video formats (equirectangular, SBS, OU, mono)
- The gyroscope feature (after implementing it)

## Bug found: VideoSphere useFrame

In `VideoPreviewModal.tsx` line 80-83:
```js
useFrame(() => {
  if (texture.current) texture.current.needsUpdate = true;
  gl.render(gl.domElement as unknown as THREE.Scene, gl.domElement as unknown as THREE.Camera);
});
```

The `gl.render(gl.domElement, ...)` call is wrong — `gl` is the WebGL renderer, not a scene/camera pair. This will throw. In R3F, `useFrame` handles rendering automatically; you just need `texture.needsUpdate = true`. The `gl.render(...)` line should be removed.

## Plan

### 1. Fix VideoSphere bug (critical)
Remove the bad `gl.render(...)` call from `useFrame`. Keep only `texture.current.needsUpdate = true`.

### 2. Add gyroscope support for mobile
In `VideoPreviewModal.tsx`, add a `DeviceOrientationControls`-like effect:
- R3F doesn't have built-in DeviceOrientationControls in Drei (removed)
- Best approach: manually handle `deviceorientation` event and update the camera rotation using quaternions
- Pattern: listen to `DeviceOrientationEvent`, convert alpha/beta/gamma to a quaternion using THREE.js `Quaternion.setFromEuler`, apply to camera
- Add a state `gyroEnabled` — auto-enable when `DeviceOrientationEvent` is available, with a manual toggle button
- The gyro controls replace OrbitControls on mobile; on desktop OrbitControls remain

```tsx
// Hook: useDeviceOrientation
function useDeviceOrientation(enabled: boolean, camera: THREE.Camera) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: DeviceOrientationEvent) => {
      const { alpha, beta, gamma } = e;
      if (alpha == null) return;
      // Convert device orientation to camera quaternion
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(beta ?? 0),
        THREE.MathUtils.degToRad(alpha ?? 0),
        THREE.MathUtils.degToRad(-(gamma ?? 0)),
        'YXZ'
      );
      camera.quaternion.setFromEuler(euler);
    };
    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [enabled, camera]);
}
```

Implementing this inside the Canvas via a custom inner component that uses `useThree()`.

### 3. README rewrite additions

The README is already 516 lines but the "Ce qui reste à faire" section is outdated (SSE, IP detection, 360° player are all done now). Also missing:

**New sections to add:**
- **Unity ? Non — voici comment ça marche vraiment** : explain the videos are pre-rendered MP4 equirectangular files played by Skybox Player (or similar). No Unity, no game engine needed.
- **Où stocker les vidéos / D'où viennent-elles** : explain video formats, sources (real-world 360° cameras, CGI renders, purchase platforms like Wevr, Veer, Vreel), naming convention
- **Lecture sur le casque (Skybox Player)** : explain how the Quest reads the files once pushed to `/sdcard/Movies/VR-Ultimate/`
- **Le player 360° dans l'app** : explain it's a desktop browser preview, not the actual VR experience
- **Gyroscope** : document the new feature
- **Ce qui reste à faire** : update the checklist (SSE done, IP done, 360° done, gyro done; remaining: auth middleware, notifications)

### Files to modify

1. **`src/components/dashboard/VideoPreviewModal.tsx`**
   - Fix `useFrame` bug (remove bad `gl.render()` call)
   - Add gyroscope support with `DeviceOrientationEvent`
   - Add a gyro toggle button (📱 icon) visible on mobile alongside the 360° toggle
   - Auto-detect if gyroscope is available via `'DeviceOrientationEvent' in window`

2. **`README.md`**
   - Fix "Ce qui reste à faire" checklist (mark SSE, IP, 360°, gyro as done)
   - Add section **"Unity ? Non."** explaining the stack
   - Add section **"Les vidéos — d'où viennent-elles, comment les stocker"** with format details, sources, naming convention
   - Add section **"Lecture sur le casque (sans Unity)"** explaining Skybox Player / Quest Media Player
   - Update architecture diagram to include new endpoints

### Gyro implementation detail

The inner component pattern (needed because `useThree()` must be inside `Canvas`):

```tsx
function GyroControls({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  
  useEffect(() => {
    if (!enabled) return;
    const screenOrientation = window.screen?.orientation?.angle ?? 0;
    
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha == null) return;
      // ZXY order for device orientation → world space camera
      const alpha = THREE.MathUtils.degToRad(e.alpha);  // z-axis rotation (compass)
      const beta  = THREE.MathUtils.degToRad(e.beta ?? 0);   // x-axis (front-back tilt)
      const gamma = THREE.MathUtils.degToRad(e.gamma ?? 0);  // y-axis (left-right tilt)
      
      const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
      const q = new THREE.Quaternion().setFromEuler(euler);
      // Offset for portrait screen orientation
      const screenQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1), -screenOrientation * (Math.PI / 180)
      );
      camera.quaternion.multiplyQuaternions(q, screenQ);
    };
    
    window.addEventListener('deviceorientation', handler, true);
    return () => window.removeEventListener('deviceorientation', handler, true);
  }, [enabled, camera]);
  
  return null;
}
```

Then in `VR360Canvas`, accept `gyroEnabled` prop and conditionally render `<GyroControls>` vs `<OrbitControls>`.

On mobile: disable `OrbitControls` and enable `GyroControls`. On desktop: `OrbitControls` only.

For the iOS permission (iOS 13+ requires explicit user gesture to request `DeviceOrientationEvent` permission):
```ts
const requestGyro = async () => {
  if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
    const perm = await (DeviceOrientationEvent as any).requestPermission();
    if (perm === 'granted') setGyroEnabled(true);
  } else {
    setGyroEnabled(true); // Android/desktop: no permission needed
  }
};
```

The gyro button will show 📱 icon and trigger this permission flow.

## Summary

**2 code changes + 1 README update:**

| File | Change |
|---|---|
| `VideoPreviewModal.tsx` | Fix useFrame bug + add GyroControls component + gyro toggle button |
| `README.md` | Update checklist + add Unity/video/Skybox sections |

**Testing note for the user**: The hardware tests (Préparer Wi-Fi, real ADB sync) require a physical Meta Quest headset connected to the machine running `npm run dev:all`. These cannot be verified from the Lovable browser preview — I'll document exactly what to expect at each step.
