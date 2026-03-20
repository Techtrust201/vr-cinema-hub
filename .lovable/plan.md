
## Bouton "Préparer Wi-Fi" dans DeviceCard

### Ce qui existe déjà
- `POST /api/connect` dans `sync-server.js` — pour `adb connect IP:PORT`
- `connectDevice()` dans `serverApi.ts`
- DeviceCard reçoit `onUpdate` et `onRemove` mais aucun callback pour des actions contextuelles

### Ce qui manque
1. `POST /api/tcpip/:serial` dans `server/sync-server.js` — exécute `adb -s SERIAL tcpip 5555`
2. `prepareTcpip(serial, baseUrl?)` dans `src/lib/serverApi.ts`
3. Bouton "Préparer Wi-Fi" dans `DeviceCard` — visible au hover, uniquement si `onPrepareWifi` prop est fourni
4. Wiring dans `Devices.tsx` — passer `onPrepareWifi` à chaque `DeviceCard`

### Design du bouton

Dans le footer de `DeviceCard`, à côté de la batterie, ajouter un bouton compact qui apparaît au hover sur les casques connectés (état USB, c'est-à-dire `status === "connected"` et pas d'`ipAddress`). Il est visible mais grisé sur les casques déconnectés (pas de serial ADB disponible).

Logique :
- Clic → appelle `prepareTcpip(device.serial)` via la prop `onPrepareWifi`
- Affiche un loader pendant l'appel
- Toast succès : "Casque prêt en Wi-Fi — débranchez le câble puis cliquez Wi-Fi ADB"
- Toast erreur si l'appel échoue

### Fichiers à modifier

1. **`server/sync-server.js`** — ajouter `POST /api/tcpip/:serial` :
```js
app.post("/api/tcpip/:serial", (req, res) => {
  const { serial } = req.params;
  if (!checkAdb()) return res.status(503).json({ error: "ADB not found" });
  try {
    const output = execSync(`adb -s ${serial} tcpip 5555`, { encoding: "utf8", timeout: 8000 });
    res.json({ success: true, output: output.trim() });
  } catch (err) {
    res.status(500).json({ error: "adb tcpip failed", detail: err.message });
  }
});
```

2. **`src/lib/serverApi.ts`** — ajouter `prepareTcpip(serial, baseUrl?)` :
```ts
export async function prepareTcpip(serial: string, baseUrl?: string): Promise<{ success: boolean; output: string }> {
  const res = await fetch(`${apiBase(baseUrl)}/tcpip/${encodeURIComponent(serial)}`, { method: "POST" });
  if (!res.ok) throw new Error("adb tcpip failed");
  return res.json();
}
```

3. **`src/components/dashboard/DeviceCard.tsx`** — ajouter prop `onPrepareWifi?: () => Promise<void>` et bouton dans le footer :
- Import `Signal`, `Loader2` depuis lucide-react
- État local `preparingWifi: boolean`
- Bouton dans le footer : icône `Signal`, texte "Préparer Wi-Fi", visible si `onPrepareWifi` est défini
- Style compact cyan, apparaît au hover de la card (comme le bouton Trash2)

4. **`src/pages/Devices.tsx`** — ajouter `handlePrepareWifi(device)` et passer la prop :
```ts
const handlePrepareWifi = async (device: Device) => {
  const baseUrl = settings.publicServerUrl?.trim() || undefined;
  await prepareTcpip(device.serial, baseUrl);
  toast.success(`${device.name} prêt — débranchez le câble puis cliquez Wi-Fi ADB`);
};
```
Passer `onPrepareWifi={() => handlePrepareWifi(d)}` à chaque `<DeviceCard>`.
