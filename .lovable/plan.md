# Plan pour débloquer le mode développeur Meta

## Objectif
Activer le mode développeur sur ton compte Meta pour que le bouton dans l’app Meta Horizon fonctionne et qu’on puisse ensuite connecter le casque en ADB.

## Ce que montrent tes captures
- Sur le téléphone, le bouton **Démarrer** est normal : il envoie vers la création / validation du compte développeur.
- Sur le PC, tu arrives sur la page **Vérifiez votre compte de développeur(se) Meta Horizon**.
- Donc le blocage actuel n’est pas le casque : c’est juste que **ton compte Meta n’est pas encore vérifié comme compte développeur**.

## Plan d’action

### 1. Finir la vérification du compte Meta
Sur l’écran PC que tu m’as montré, tu dois terminer **une** des deux options proposées :
- **Configurer l’authentification à deux facteurs** (recommandé)
- **Ajouter une carte bancaire**

Je te conseille la première.

### 2. Faire la méthode la plus simple : 2FA
Depuis cette page :
- clique sur **Configurer**
- active la **double authentification** sur ton compte Meta
- termine toutes les étapes jusqu’au bout
- reviens ensuite sur la page `developers.meta.com/horizon/manage/`

### 3. Vérifier que le compte développeur est bien validé
Après la 2FA :
- recharge la page développeur Meta
- si Meta demande encore une validation, suis-la jusqu’à la fin
- le bouton **Suivant** devrait devenir cliquable ou la page devrait te laisser finir l’onboarding

### 4. Revenir sur le téléphone
Une fois la vérification terminée :
- retourne dans **Meta Horizon**
- `Appareils` → ton casque → `Paramètres du casque` → `Mode développeur`
- le bouton **Démarrer** ne devrait plus te renvoyer dans une boucle
- tu devrais pouvoir **activer le toggle du mode développeur**

### 5. Redémarrer le casque
Quand le mode développeur est activé :
- éteins complètement le casque
- rallume-le

### 6. Passer au test USB / ADB
Ensuite seulement, on fera la suite :
- brancher le casque en USB
- accepter **Allow USB debugging** dans le casque
- vérifier `adb devices`
- puis tester le dashboard

## Si ça bloque encore
Si après activation de la 2FA tu reviens sur la même page :
- ferme complètement la page Meta Developers
- reconnecte-toi
- retourne sur `https://developers.meta.com/horizon/manage/`
- attends de voir si l’onboarding passe à l’étape suivante

## Détail important
Le message en haut sur le partage de données n’est pas bloquant. Le vrai blocage est la partie **vérification du compte développeur**.

## Ce que tu dois faire maintenant
Fais seulement cette étape :
- clique **Configurer**
- active la **2FA**
- reviens sur la page Meta Developers
- dis-moi ensuite exactement ce que tu vois :
  - **le bouton Suivant s’active**
  - ou **ça reste bloqué sur la même page**

## Détails techniques
- Meta exige une vérification d’identité légère avant d’autoriser le mode développeur.
- Cette vérification peut se faire par **2FA** ou **carte bancaire**.
- Tant que cette étape n’est pas terminée, l’app mobile affiche bien **Démarrer**, mais ne permet pas encore d’activer réellement le mode développeur.