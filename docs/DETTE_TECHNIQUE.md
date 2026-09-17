# Dette technique connue

Points identifiés lors de l'audit du 17 septembre 2026 et volontairement laissés en
attente. Chacun est accompagné de la raison de l'ajournement et de la correction à
appliquer, pour qu'une reprise ne reparte pas de zéro.

---

## 1. Un jeton de casque reste valide après un nouvel appairage

**Où** : `supabase/functions/_shared/device-jwt.ts` (vérification), `headset-pair-claim/index.ts`
(émission).

**Le problème.** La vérification d'un jeton de casque contrôle seulement la signature et
la date d'expiration, fixée à un an. Quand un casque déjà connu est réappairé, un nouveau
jeton est émis mais l'ancien continue de fonctionner jusqu'à son expiration. Un jeton
copié depuis un casque revendu, prêté ou mis au rebut garde donc accès au catalogue et
aux liens de téléchargement des films.

**Pourquoi ce n'est pas corrigé.** La correction touche le chemin d'authentification de
toute la flotte. Une erreur y rendrait tous les casques muets d'un coup. L'audit a eu lieu
quelques heures avant une livraison client, avec des casques physiquement sous contrôle :
le risque du correctif dépassait le risque de la faille.

**Correction à appliquer.**

1. Ajouter une colonne `token_version` (entier, défaut 0) à la table `headsets`.
2. Inclure cette version dans le jeton émis par `signDeviceToken`.
3. Dans `verifyDeviceToken`, rejeter un jeton dont la version est inférieure à celle
   enregistrée sur le casque.
4. Incrémenter `token_version` à chaque appairage et à chaque révocation.

Traiter l'absence de version comme la version 0 laisse les casques déjà en service
fonctionner : ils ne basculeront sur le mécanisme qu'à leur prochain appairage. La
migration se fait donc sans réappairer la flotte.

---

## 2. Le code d'appairage n'est pas protégé contre les tentatives répétées

**Où** : `supabase/functions/headset-pair-claim/index.ts`

**Le problème.** Le code d'appairage compte six chiffres, soit un million de
combinaisons, et reste valable dix minutes. Aucune limite ne freine les tentatives : un
balayage automatisé peut détourner un appairage en cours avant l'exploitant légitime.

**Pourquoi ce n'est pas corrigé.** L'attaque suppose de viser une fenêtre de dix minutes
connue à l'avance, et n'apporte l'accès qu'à un seul casque. L'ajout d'une limite de débit
demande un compteur persistant, donc une migration et des essais.

**Correction à appliquer.** Compter les échecs par adresse et par code dans une table
dédiée, et bloquer après une dizaine de tentatives. Un code alphanumérique de huit
caractères réduirait aussi fortement la surface, au prix d'une saisie plus longue au
casque.

---

## 3. Un envoi interrompu ne reprend pas où il s'est arrêté

**Où** : `src/lib/objectStore.ts`

**Le problème.** Si l'envoi d'un film est coupé, il faut le recommencer entièrement.
Les morceaux déjà déposés sont désormais nettoyés, mais rien ne permet de reprendre.

**Pourquoi ce n'est pas corrigé.** Reprendre un envoi suppose de mémoriser l'identifiant
de l'envoi en cours et les morceaux acceptés côté navigateur, puis de les retrouver après
un rechargement de page. C'est un vrai chantier, sans rapport avec un défaut.

**Contournement actuel.** Le guide d'exploitation indique de ne pas fermer l'onglet
pendant un envoi, et l'application en avertit à l'écran.

---

## 4. Les fonctions `get_user_role` et `can_manage_content` acceptent n'importe quel compte

**Où** : `supabase/migrations/20260718193000_enforce_one_role_per_user.sql`

**Le problème.** Tout utilisateur authentifié peut demander le rôle de n'importe quel
autre compte. C'est une fuite d'information, sans possibilité de modification.

**Pourquoi ce n'est pas corrigé.** `useAuth` appelle `get_user_role` au démarrage de
l'application. Restreindre la fonction sans adapter l'appel priverait l'interface du rôle
de l'utilisateur, donc de tous ses droits d'affichage.

**Correction à appliquer.** Ajouter une garde `auth.uid() = _user_id OR
is_admin_or_owner(auth.uid())` dans la fonction, après avoir vérifié que tous les appels
côté application portent bien sur l'utilisateur connecté.

---

## 5. Tables et fichiers sans usage

**Où** : tables `agents`, `devices`, `sync_jobs` ; fichiers `src/lib/assignmentDiff.ts`
et `src/lib/originHmac.ts`.

Ces éléments datent de versions antérieures et ne sont plus référencés par
l'application, hors tests. Ils ne présentent pas de risque, mais alourdissent la lecture
du schéma et du code. À retirer lors d'un passage de nettoyage, après vérification qu'aucun
outil externe ne s'appuie dessus.
