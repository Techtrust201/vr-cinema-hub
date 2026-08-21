# Dépannage

> Tout le dépannage casque est dans **[`HEADSET_ONBOARDING.md` § 10](./HEADSET_ONBOARDING.md#10-dépannage)**.

Pour un diagnostic rapide :

```bash
adb logcat -v time -s Unity:I | grep -E 'Heartbeat|Manifest|SyncLifecycle|SyncReport|BackendConfig|Error|Exception'
```
