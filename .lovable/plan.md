## Option B — Factory reset + appairage sur ton compte Meta

Objectif : pouvoir activer le Developer Mode sur le casque pour tester l'ADB. Le casque sera remis sur le compte du client avant restitution.

---

### ⚠️ Avant de commencer — IMPORTANT

1. **Préviens le client** que tu vas factory reset le casque. Tout son contenu local sera effacé (saves de jeux non-cloud, captures d'écran non synchro, comptes invités). Ses jeux achetés restent liés à son compte Meta et se re-téléchargent après ré-appairage.
2. **Note son identifiant Meta / email** (juste l'email suffit) pour pouvoir lui rendre le casque rebasculé sur son compte.
3. **Charge le casque à 50% minimum** avant le reset.

---

### Étape B.1 — Factory reset du casque

Deux méthodes, prends la plus simple :

**Méthode A — Via l'app Meta Horizon (si le casque est encore lié au client)**
Ne marche pas pour toi vu que tu n'as pas accès au compte du client. Passe à la méthode B.

**Méthode B — Via le menu boot (hardware)**
1. Éteins complètement le casque (maintien `Power` ~3s → "Power off").
2. Casque éteint, **maintiens simultanément `Power` + `Volume bas`** pendant ~10 secondes.
3. Le menu boot (USB Update Mode) apparaît dans le casque. Navigation avec les boutons volume, validation avec power.
4. Sélectionne **"Factory reset"** → confirme **"Yes, erase and factory reset"**.
5. Attends ~2 min, le casque redémarre tout neuf.

### Étape B.2 — Appairer le casque à TON compte Meta

1. Sur ton téléphone, ouvre **Meta Horizon**, connecte-toi avec ton compte Meta perso (celui que tu as créé sur developers.meta.com).
2. Mets le casque sur la tête → suis le tutoriel d'initialisation (langue, Wi-Fi, garde-fou, etc.).
3. Au moment du pairing : un **code à 5 chiffres** s'affiche dans le casque.
4. Dans Meta Horizon : `Menu` → `Devices` → `Pair new headset` → tape le code → c'est pairé.

### Étape B.3 — Créer ton organisation développeur

Si ce n'est pas déjà fait sur https://developers.meta.com/horizon/manage/ :
1. Connecte-toi avec ton compte Meta.
2. "Create new organization" → nom au choix (`test-perso`) → accepte les CGU dev.
3. Sans cette étape, le toggle Developer Mode n'apparaîtra PAS dans Meta Horizon.

### Étape B.4 — Activer le Developer Mode

1. Dans Meta Horizon (mobile) : `Menu` → `Devices` → ton casque → `Headset settings` → `Developer mode` → **active le toggle**.
2. Si le toggle est grisé ou absent → ton organisation dev (B.3) n'est pas validée. Refresh l'app, ou attends 1-2 min.
3. Redémarre le casque (maintien power 10s → restart).

### Étape B.5 — Continuer les tests ADB

Une fois le Dev Mode actif, on enchaîne sur les étapes 1-7 du guide `.lovable/plan.md` déjà rédigé :
- Étape 1 : USB + popup "Allow USB debugging" + `adb devices`
- Étape 2 : `npm run dev:all` + bascule Mode Réel
- Étape 3 : Détecter via ADB dans le dashboard
- Étape 4 : Wi-Fi ADB
- Étape 5-6 : Sync MP4 réel + logs SSE
- Étape 7 : Gyroscope iPhone

### Étape B.6 — Restituer le casque au client

Quand tous les tests sont finis :
1. Factory reset à nouveau (même procédure que B.1).
2. Rends le casque au client → il le ré-appaire normalement avec son compte sur sa propre Meta Horizon.
3. Il re-télécharge ses jeux achetés (auto, liés au compte).

---

### Ce qui pourrait coincer

| Problème | Solution |
|---|---|
| Code à 5 chiffres n'apparaît pas | Vérifie que casque et téléphone sont sur le même Wi-Fi, app Meta Horizon à jour |
| Toggle Dev Mode grisé | Crée l'organisation dev (B.3), redémarre l'app mobile |
| `adb devices` montre `unauthorized` | Remets le casque, accepte la popup USB debugging, coche "Always allow" |
| Casque ne boot pas en USB Update Mode | Relâche les boutons, retente, maintiens bien 10s |

---

**Confirme que tu veux lancer Option B**, et dès que tu vois le code à 5 chiffres dans le casque (étape B.2) ou que tu bloques, ping-moi. Une fois le Dev Mode actif on attaque l'étape 1 du guide ADB.
