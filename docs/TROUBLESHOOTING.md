# Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Casque allumé mais pas « Application active » | App fermée ou heartbeat absent | Lancer l’app VR, vérifier logcat Heartbeat |
| Toujours « Jamais connectée » | Pas de token / pairing incomplet | Refaire pairing |
| « Révoqué » | Admin a révoqué | Réappairer |
| desired &gt; applied | Sync pas terminée ou report refusé | Logs SyncReport reason=… |
| Vidéos cache encore visibles | Ancien bug fallback legacy | APK avec LibraryManifestSource autoritatif |
| Realtime ne met pas à jour l’UI | Policy deny-all sur realtime.messages | Polling 15 s déjà en place |

## Logcat filtré

```bash
adb logcat -v time \
  -s Unity:I \
  | grep -E 'Heartbeat|Manifest|SyncLifecycle|Prepare|Download|LibraryManifest|Library3D|LibraryRefresh|SyncReport|Exception|Error'
```
