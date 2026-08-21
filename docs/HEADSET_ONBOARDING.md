# Guide casque Meta Quest — Ubuntu (A à Z)

> **Une seule doc à suivre.** Tout le reste (runbook, troubleshooting) renvoie ici.

Ce guide configure un casque Meta Quest (2, 3 ou Pro) pour **VR Cinema Hub** : installation de l’app Unity, appairage dashboard, assignation de contenu, vérification sync.

**Durée estimée :** 20–30 min la première fois.

---

## Avant de commencer

### Ce qu’il te faut

| Élément | Détail |
|---------|--------|
| PC Ubuntu | 22.04 ou 24.04 recommandé |
| Casque Meta Quest | Chargé (> 50 %), connecté au **même Wi‑Fi** que le PC (pour la sync cloud après install) |
| Câble USB | Câble **data** (pas charge seule) — USB‑C vers USB‑C ou USB‑A |
| Compte Meta Developer | Gratuit : https://developer.oculus.com |
| Téléphone | App **Meta Quest** (pour activer le mode développeur) |
| APK | Fichier `.apk` fourni par l’équipe (voir § 2) |
| Accès dashboard | Compte admin/operator sur VR Cinema Hub |

### Règle d’or

**Casque allumé ≠ application active.**

Le dashboard affiche le contact **de l’app VR Cinema Quest** avec le serveur, pas si le casque est physiquement allumé. Si l’app est fermée, le casque apparaît « hors ligne » même allumé.

---

## 1. Préparer Ubuntu (ADB)

### 1.1 Installer les outils

```bash
sudo apt update
sudo apt install -y android-tools-adb android-tools-fastboot
```

Vérifier :

```bash
adb version
# → Android Debug Bridge version …
```

### 1.2 Règles udev (éviter `sudo adb`)

Sans ça, `adb devices` peut rester vide ou demander les droits root à chaque branchement.

```bash
# Créer le fichier de règles Meta/Oculus
sudo tee /etc/udev/rules.d/51-android-meta.rules << 'EOF'
# Meta Quest / Oculus
SUBSYSTEM=="usb", ATTR{idVendor}=="2833", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="18d1", MODE="0666", GROUP="plugdev"
EOF

# Recharger udev
sudo udevadm control --reload-rules
sudo udevadm trigger

# Ajouter ton utilisateur au groupe plugdev (déconnexion/reconnexion requise après)
sudo usermod -aG plugdev "$USER"
```

> Si `adb devices` ne voit toujours rien après branchement, **déconnecte-toi et reconnecte-toi** à ta session Ubuntu (ou redémarre).

### 1.3 Redémarrer le serveur ADB (si besoin)

```bash
adb kill-server
adb start-server
```

---

## 2. Choisir le bon APK (staging vs production)

**Ne pas mélanger** : l’APK, le dashboard et le backend doivent correspondre.

| Environnement | Icône sur le casque | Package Android | Fichier APK (dossier builds) | Dashboard à ouvrir |
|---------------|---------------------|-----------------|------------------------------|-------------------|
| **Staging / labo** | VR Cinema Quest **Staging** | `com.techtrust.vrcinemaquest.staging` | `VR-Cinema-Quest-STAGING-XR-FIX.apk` | `http://127.0.0.1:5173` (local) ou preview Vercel staging |
| **Production** | VR Cinema Quest | `com.techtrust.vrcinemaquest` | `VR-Cinema-Quest-PRODUCTION.apk` | `https://vr-cinema-hub.vercel.app` |

Chemin typique des APK dans le repo :

```bash
ls -lh /home/hugo/work/vr-cinema-hub/vr-cinema-quest-app-unity/builds/*.apk
```

> **Piège fréquent :** ouvrir l’icône « VR Cinema Quest » (prod) alors que tu testes en staging — tu verras d’anciennes vidéos et un mauvais backend. Utilise **toujours** l’icône qui correspond à ton environnement.

---

## 3. Activer le mode développeur sur le Quest

1. Crée un compte sur https://developer.oculus.com (gratuit).
2. Crée une **organisation** Meta Developer si demandé.
3. Sur ton **téléphone**, ouvre l’app **Meta Quest**.
4. Va dans **Menu → Appareils → [ton casque] → Mode développeur** → **Activer**.
5. Sur le **casque** : **Paramètres → Système → Développeur** → active **Mode développeur USB**.

---

## 4. Brancher le casque en USB

1. Branche le Quest au PC Ubuntu.
2. Mets le casque et **accepte la popup** « Autoriser le débogage USB ? »
   - Coche **Toujours autoriser cet ordinateur**.
3. Sur le casque, vérifie que **Mode développeur USB** est activé (Paramètres → Système → Développeur).

### 4.1 Vérifier la connexion

```bash
adb devices -l
```

Résultat attendu :

```text
List of devices attached
2G0YC1ZG1M02RF       device usb:… product:… model:Quest_3 device:…
```

| État affiché | Signification | Action |
|--------------|---------------|--------|
| `device` | OK | Continuer |
| `unauthorized` | Popup RSA non acceptée | Remets le casque, accepte la popup |
| (rien) | Câble charge-only ou udev | Change câble, refais § 1.2, `adb kill-server && adb start-server` |
| `offline` | Connexion instable | Débranche/rebranche, redémarre le casque |

Récupérer le numéro de série (utile pour le support) :

```bash
adb devices -l | awk '/device usb/ {print $1}'
```

---

## 5. Installer l’application VR

### 5.1 Staging (recommandé pour premier test)

```bash
APK="/home/hugo/work/vr-cinema-hub/vr-cinema-quest-app-unity/builds/VR-Cinema-Quest-STAGING-XR-FIX.apk"

adb install -r "$APK"
```

### 5.2 Production

```bash
APK="/home/hugo/work/vr-cinema-hub/vr-cinema-quest-app-unity/builds/VR-Cinema-Quest-PRODUCTION.apk"

adb install -r "$APK"
```

`-r` = réinstalle par-dessus si l’app existe déjà (conserve les données locales).

### 5.3 Vérifier l’installation

```bash
# Staging
adb shell pm list packages | grep vrcinemaquest

# Doit afficher com.techtrust.vrcinemaquest.staging OU com.techtrust.vrcinemaquest
```

Voir quelle app est au premier plan :

```bash
adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | head -3
```

---

## 6. Lancer l’app sur le casque

### Option A — Depuis le casque (recommandé)

1. Enlève le casque si besoin.
2. Menu Quest → **Apps** → **Sources inconnues** (ou bibliothèque « Inconnues »).
3. Lance **VR Cinema Quest Staging** (staging) ou **VR Cinema Quest** (prod).

### Option B — Depuis Ubuntu (ADB)

```bash
# Staging
adb shell am start -n com.techtrust.vrcinemaquest.staging/com.unity3d.player.UnityPlayerGameActivity

# Production
adb shell am start -n com.techtrust.vrcinemaquest/com.unity3d.player.UnityPlayerGameActivity
```

Forcer un redémarrage propre de l’app :

```bash
adb shell am force-stop com.techtrust.vrcinemaquest.staging
adb shell am start -n com.techtrust.vrcinemaquest.staging/com.unity3d.player.UnityPlayerGameActivity
```

### Écran attendu

- **Premier lancement** : écran **Appairage casque** avec un **code à 6 chiffres** (ex. `428193`).
- Le code expire après quelques minutes — si expiré, relance l’app pour en obtenir un nouveau.

---

## 7. Ouvrir le dashboard et appairer

### 7.1 URL du dashboard

| Environnement | URL |
|---------------|-----|
| Staging local | `http://127.0.0.1:5173` (lancer `npm run dev` dans le repo si besoin) |
| Production | `https://vr-cinema-hub.vercel.app` |

Lancer le dashboard en local (staging) :

```bash
cd /home/hugo/work/vr-cinema-hub
npm install   # première fois seulement
npm run dev
# → ouvre http://127.0.0.1:5173 dans le navigateur
```

Connecte-toi avec ton compte admin/operator.

### 7.2 Appairer le casque

1. Va dans **Casques** (menu latéral).
2. Clique **Appairer un casque**.
3. Saisis le **code à 6 chiffres** affiché dans le casque.
4. Donne un **nom métier clair** (ex. `Salon Paris #1`, `Demo Client Dupont`).
5. Clique **Appairer**.

Le casque poll le serveur toutes les ~3 s ; en quelques secondes l’écran d’appairage disparaît et l’app passe en mode bibliothèque.

### 7.3 Vérifier l’appairage côté Ubuntu (optionnel)

```bash
adb logcat -v time -s Unity:I | grep -E 'pair|Pair|token|BackendConfig|Heartbeat'
```

Tu dois voir un log du type `[BackendConfig] env=… url=https://fllhnbeukuwrvserebqn.supabase.co` puis des heartbeats.

---

## 8. Assigner du contenu

Ordre recommandé :

### 8.1 Créer un groupe (optionnel mais pratique)

1. Dashboard → **Groupes**.
2. Saisis un nom → **Créer**.
3. Clique sur le groupe → coche le casque pour l’y ajouter.

### 8.2 Créer / éditer une playlist

1. Dashboard → **Playlists**.
2. **Créer** une playlist (ex. `Demo juillet`).
3. Clique **Éditer** sur la playlist :
   - Colonne **Vidéos** : coche les vidéos à inclure.
   - Colonne **Diffuser à** : coche un **groupe**, un **casque** ou **Tous les casques**.

> Une playlist vide ne peut pas être assignée — ajoute au moins une vidéo d’abord.

### 8.3 Attendre la synchronisation

Le casque télécharge automatiquement les vidéos via Wi‑Fi (pas besoin du câble USB après l’install).

Sur la page **Casques**, vérifie :

| Indicateur | Signification attendue |
|------------|------------------------|
| **Application active** | Contact serveur &lt; 2 min — l’app tourne |
| **à jour · vN** | `applied == desired` — sync terminée |
| **en attente · dX/aY** | Sync en cours (`applied < desired`) |
| **erreur · dX/aY** | Problème sync — voir § 10 |

---

## 9. Checklist de validation finale

Coche chaque point :

- [ ] `adb devices` → `device` (pas `unauthorized`)
- [ ] Bonne icône lancée (Staging vs Prod)
- [ ] Code appairé dans le dashboard → toast « Casque appairé »
- [ ] Statut **Application active** (&lt; 2 min)
- [ ] Badge **à jour** (`desired == applied`)
- [ ] Une vidéo se lit dans le casque
- [ ] Retirer une vidéo de la playlist → disparaît du menu casque après resync

---

## 10. Dépannage

### Casque allumé mais pas « Application active »

**Cause :** l’app VR est fermée ou n’a pas envoyé de heartbeat.

```bash
# Relancer l’app
adb shell am force-stop com.techtrust.vrcinemaquest.staging
adb shell am start -n com.techtrust.vrcinemaquest.staging/com.unity3d.player.UnityPlayerGameActivity

# Suivre les heartbeats
adb logcat -v time -s Unity:I | grep -E 'Heartbeat|Manifest|SyncLifecycle|SyncReport|Error|Exception'
```

Checklist :
- App ouverte sur le casque ?
- Wi‑Fi Quest connecté à Internet ?
- Bon APK / bon dashboard (staging vs prod) ?

### « Jamais connectée »

**Cause :** appairage incomplet ou token absent.

1. Relance l’app → nouvel écran appairage avec code.
2. Dashboard → **Casques → Appairer** → ressaisis le code.
3. Si le casque existait déjà : supprime-le du dashboard et réappaire.

Réinitialiser les données locales (efface token + cache vidéos) :

```bash
# Staging — ATTENTION : supprime les vidéos locales
adb shell pm clear com.techtrust.vrcinemaquest.staging

# Puis relance l’app et refais l’appairage
adb shell am start -n com.techtrust.vrcinemaquest.staging/com.unity3d.player.UnityPlayerGameActivity
```

### Statut « Révoqué »

**Cause :** un admin a révoqué le casque dans le dashboard.

1. Dashboard → **Casques** → bouton **Révoquer** a été utilisé.
2. Solution : `pm clear` (ci-dessus) + **réappairer** avec un nouveau code.
3. Ou supprimer le casque du dashboard et recréer l’appairage.

### `desired > applied` (sync bloquée)

**Cause :** téléchargement en cours, Wi‑Fi lent, stockage plein, ou erreur reportée.

```bash
adb logcat -v time -s Unity:I | grep -E 'SyncReport|Download|Prepare|Manifest|reason'
```

Checklist :
- Assez d’espace disque sur le Quest ? (visible sur la carte casque dans le dashboard)
- Wi‑Fi stable ?
- Attendre 5–10 min pour grosses vidéos

### Mauvaises vidéos / ancienne interface

**Cause :** mauvaise app lancée (prod vs staging).

Vérifier quelle app est active :

```bash
adb shell dumpsys activity activities | grep -E 'topResumedActivity|mFocusedApp' | head -5
```

Packages installés :

```bash
adb shell pm list packages -f | grep vrcinemaquest
```

Lance **uniquement** l’app correspondant à ton environnement (§ 2).

### `adb devices` vide sur Ubuntu

```bash
# 1. Vérifier que le casque est vu par le système
lsusb | grep -i '2833\|Oculus\|Meta'

# 2. Refaire udev (§ 1.2) puis :
adb kill-server && adb start-server && adb devices

# 3. Tester un autre port USB / câble
```

### Logcat filtré (diagnostic complet)

```bash
adb logcat -v time \
  -s Unity:I \
  | grep -E 'Heartbeat|Manifest|SyncLifecycle|Prepare|Download|LibraryManifest|Library3D|LibraryRefresh|SyncReport|BackendConfig|Exception|Error'
```

---

## 11. Commandes utiles (aide-mémoire)

```bash
# Connexion
adb devices -l
adb kill-server && adb start-server

# Install / relance staging
APK="/home/hugo/work/vr-cinema-hub/vr-cinema-quest-app-unity/builds/VR-Cinema-Quest-STAGING-XR-FIX.apk"
adb install -r "$APK"
adb shell am force-stop com.techtrust.vrcinemaquest.staging
adb shell am start -n com.techtrust.vrcinemaquest.staging/com.unity3d.player.UnityPlayerGameActivity

# Install / relance production
APK="/home/hugo/work/vr-cinema-hub/vr-cinema-quest-app-unity/builds/VR-Cinema-Quest-PRODUCTION.apk"
adb install -r "$APK"
adb shell am force-stop com.techtrust.vrcinemaquest
adb shell am start -n com.techtrust.vrcinemaquest/com.unity3d.player.UnityPlayerGameActivity

# Reset appairage (staging)
adb shell pm clear com.techtrust.vrcinemaquest.staging

# Logs sync
adb logcat -v time -s Unity:I | grep -E 'Heartbeat|Manifest|SyncReport|Error'

# Dashboard local
cd /home/hugo/work/vr-cinema-hub && npm run dev
```

---

## 12. Réappairer un casque existant

1. Dashboard → **Casques** → **Révoquer** ou **Supprimer** l’ancienne entrée.
2. Sur le Quest : `adb shell pm clear <package>` (§ 10).
3. Relance l’app → nouveau code à 6 chiffres.
4. Dashboard → **Appairer un casque** → code + nom.
5. Réassigne groupe / playlist.
6. Vérifie **Application active** + **à jour**.

---

## Références techniques (pour devs)

| Sujet | Document |
|-------|----------|
| Environnements staging/prod | `docs/ENVIRONMENTS.md` |
| API casque (pairing, manifest) | `docs/API.md` |
| Build APK Unity | `docs/RELEASE_PROCESS.md` |
| Architecture sync | `docs/ARCHITECTURE.md` |
