## Guide complet — Tester ton vrai casque Meta Quest

Ce n'est pas un plan de code : c'est une checklist manuelle. Tu coches dans l'ordre, et tu me dis dès qu'un truc bloque (copie/colle l'erreur, je dépanne).

---

### Étape 0 — Préparer le casque (mode développeur)

Le mode dev n'est PAS activable depuis le casque. Il faut passer par l'app mobile Meta.

1. Crée un compte développeur Meta gratuit : https://developers.meta.com/horizon/manage/ → "Create new organization" (n'importe quel nom, ex. "test-perso"). Sans ça, le toggle dev n'apparaît pas.
2. Sur ton téléphone, ouvre l'app **Meta Horizon** (anciennement Oculus), connecte-toi avec **le même compte** que celui du casque.
3. Dans l'app : `Menu` → `Devices` → sélectionne ton casque → `Headset settings` → `Developer mode` → **active le toggle**.
4. Éteins puis rallume le casque (maintien power 10s).

### Étape 1 — Brancher en USB et autoriser ADB

1. Branche le casque au PC avec un câble USB-C **data** (pas un câble de charge bas de gamme).
2. Mets le casque sur la tête : une popup apparaît dans le casque → **"Allow USB debugging"** → coche "Always allow" → Allow.
3. Dans ton terminal Linux :
   ```bash
   adb devices
   ```
   Tu dois voir une ligne du genre `1WMHHXXXXXXXXX  device`. Si tu vois `unauthorized` → remets le casque, refais la popup. Si rien n'apparaît → ajoute ton user au groupe `plugdev` et installe les udev rules :
   ```bash
   sudo usermod -aG plugdev $USER
   # puis logout/login
   ```

### Étape 2 — Lancer le dashboard en mode réel

1. Dans `/dev-server` du projet :
   ```bash
   npm run dev:all
   ```
   Ça lance Vite (frontend) + le serveur Node (`server/sync-server.js` sur `:3001`).
2. Ouvre le preview → va dans **Paramètres** → bascule sur **Mode Réel**. Le badge en haut doit devenir vert "Mode Réel".
3. Tu verras la liste casques se vider → c'est normal.

### Étape 3 — Détecter le casque dans le dashboard

1. Va sur la page **Casques**.
2. Clique le bouton **"Détecter via ADB"** (ou équivalent). Le frontend appelle `GET /api/devices` qui exécute `adb devices -l`.
3. Ton Quest doit apparaître avec son serial, son modèle ("Quest 2"/"Quest 3"), sa batterie et son stockage.

**Si rien ne s'affiche** : ouvre la console navigateur (F12) → onglet Network → regarde la réponse de `/api/devices`. Copie-la moi.

### Étape 4 — Préparer Wi-Fi ADB (sans fil)

Permet de débrancher le câble une fois configuré.

1. **Le PC et le casque doivent être sur le même Wi-Fi.**
2. Sur la page Casques (casque toujours en USB), clique **"Préparer Wi-Fi"**. Ça lance `adb tcpip 5555` côté serveur.
3. Puis clique **"Détecter IP"** ou similaire → le serveur fait `adb shell ip addr show wlan0` et te renvoie l'IP (ex. `192.168.1.42`).
4. Clique **"Connecter en Wi-Fi"** → ça fait `adb connect 192.168.1.42:5555`.
5. **Débranche l'USB**. Refais "Détecter via ADB" : le casque doit toujours être listé mais avec un serial `192.168.1.42:5555`.

### Étape 5 — Préparer un MP4 de test

Comme tu n'as pas de fichier, on en chope un petit pour tester :

```bash
# crée le dossier de stockage (au choix, je te conseille un dossier dans ton home)
mkdir -p ~/vr-videos

# télécharge un MP4 d'exemple (10 Mo, Big Buck Bunny)
curl -L -o ~/vr-videos/test.mp4 \
  https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4
```

Puis relance le serveur en pointant vers ce dossier :

```bash
# arrête npm run dev:all (Ctrl+C) puis :
VIDEO_STORAGE_PATH=$HOME/vr-videos npm run dev:all
```

Dans **Paramètres** du dashboard, mets le même chemin (`/home/TON_USER/vr-videos`) dans "Chemin stockage vidéo" et sauvegarde.

### Étape 6 — Lancer une vraie sync ADB avec logs SSE

1. Va dans **Bibliothèques** → ajoute manuellement une entrée pointant vers `test.mp4` (nom = `test.mp4`, taille ≈ 0.01 GB, format = 360 mono peu importe pour le test).
2. Va dans **Synchronisation** → sélectionne ton casque + la vidéo → **Lancer la sync**.
3. Tu dois voir les logs défiler en temps réel (SSE) :
   ```
   [HH:MM:SS] Connexion ADB → 1WMHH...
   [HH:MM:SS] Appareil connecté ✓
   [HH:MM:SS] Push: test.mp4 (0.01 GB)…
   [HH:MM:SS] test.mp4 — 100%
   [HH:MM:SS] ✓ test.mp4 — terminé
   [HH:MM:SS] manifest.json envoyé ✓
   [HH:MM:SS] Sync terminée — 1 envoyé(s)…
   ```
4. Tu dois recevoir une notif système Linux (libnotify) + une notif in-app dans la cloche.
5. **Vérifier sur le casque** : dans le casque → app "Files" → `Movies/VR-Ultimate/` → `test.mp4` doit y être.

### Étape 7 — Tester le gyroscope mobile (iPhone/iPad)

1. Récupère l'URL publique du dashboard. Deux options :
   - **ngrok** (recommandé) : `ngrok http 3001` → te donne une URL `https://xxx.ngrok.app`.
   - Ou Wi-Fi local : `http://IP_DE_TON_PC:3001` (ne marchera pas en HTTPS, donc gyroscope iOS désactivé → utilise ngrok).
2. Sur l'iPhone, ouvre cette URL dans **Safari** (pas Chrome).
3. Ouvre la page Bibliothèques → clique sur une vidéo pour ouvrir le player 360°.
4. iOS demande l'autorisation **"Motion & Orientation"** → Allow.
5. Bouge le téléphone : la vue doit suivre. Si rien ne bouge → fallback A-Frame s'active automatiquement, vérifie la console Safari (connecte le phone au Mac, sinon zappe).

---

## Ce qu'on saura à la fin

| Test | Quoi valider |
|---|---|
| ADB USB | Le serial apparaît dans `/api/devices` |
| Préparer Wi-Fi | Sync possible sans câble |
| Sync réelle | MP4 présent dans `Movies/VR-Ultimate/` du casque + logs SSE OK |
| Notifications | Notif système Linux + cloche in-app |
| Gyroscope | Vue 360 qui suit le mouvement sur iPhone |

---

## Prochaine étape

Approuve ce plan pour passer en mode build, **mais** comme c'est 100% manuel il n'y a rien à coder. Tu peux directement commencer à l'**Étape 0** et me ping à chaque étape avec :
- "OK étape X passée"
- ou l'erreur exacte (capture/copie terminale)

Je te débugge en live.
