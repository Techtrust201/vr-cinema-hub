# Dette technique connue

Points identifiés lors de l'audit du 17 septembre 2026 et restés en attente, avec la
raison de l'ajournement et la correction à appliquer. Les constats corrigés le même jour
ne figurent plus ici : voir l'historique Git.

---

## 1. Un envoi interrompu ne reprend pas où il s'est arrêté

**Où** : `src/lib/objectStore.ts`

**Le problème.** Si l'envoi d'un film est coupé — onglet fermé, coupure réseau, veille de
l'ordinateur — il faut le recommencer entièrement. Les morceaux déjà déposés sont
désormais nettoyés automatiquement, mais rien ne permet de repartir du point d'arrêt.
Pour un film de plusieurs gigaoctets sur une connexion modeste, c'est une heure perdue.

**Pourquoi ce n'est pas corrigé.** Reprendre un envoi suppose de mémoriser l'identifiant
de l'envoi en cours et la liste des morceaux acceptés, de les conserver après un
rechargement de page, puis de demander au serveur quels morceaux il détient déjà. C'est
une fonctionnalité à part entière, pas la réparation d'un défaut.

**Contournement actuel.** Le guide d'exploitation demande de ne pas fermer l'onglet
pendant un envoi, et l'application affiche un avertissement tant qu'un envoi est en
cours.

---

## 2. `can_manage_content` répond sur n'importe quel compte

**Où** : `supabase/migrations/20260718200100_owner_role_helpers_and_audit.sql`

**Le problème.** Tout utilisateur connecté peut demander si un autre compte a le droit de
gérer du contenu. C'est une fuite d'information, sans possibilité de modification.

**Pourquoi ce n'est pas corrigé.** Cette fonction est appelée par une dizaine de
politiques de sécurité, sur les tables comme sur le stockage. Y ajouter un refus ferait
courir un risque de régression sur tous les accès aux données, pour protéger un simple
booléen qui ne révèle même pas quel rôle est en cause. Le compromis n'est pas
favorable.

`get_user_role`, qui expose le rôle exact et n'est utilisée par aucune politique, a
elle été restreinte.

**Correction à envisager.** Si le besoin se confirme, remplacer les appels dans les
politiques par une variante interne non exposée, puis restreindre la fonction publique.
À faire hors période de livraison, avec une vérification complète des accès.

---

## 3. Tables restées d'une architecture antérieure

**Où** : tables `agents`, `devices`, `sync_jobs`.

Ces tables datent d'avant le passage aux casques autonomes. Aucun code ne les lit ni ne
les écrit. Elles portent désormais un commentaire « HORS SERVICE » visible dans la
console Supabase, mais n'ont pas été supprimées : une suppression est irréversible et
n'apporte rien d'autre qu'un schéma plus court. À retirer lors d'un passage de nettoyage
si leur inutilité se confirme sur la durée.

---

## 4. L'historique des migrations est désynchronisé

**Où** : `supabase/migrations/` face à la base de production.

**Le problème.** Cinq migrations locales n'ont pas d'équivalent distant, et cinq
migrations distantes n'existent pas en local. Leur contenu a manifestement été appliqué
sous d'autres horodatages, via l'éditeur SQL ou un outil externe.

**Conséquence pratique.** `supabase db push` est dangereux en l'état : il tenterait de
rejouer des migrations dont le contenu est déjà en place. Les migrations du 17 septembre
ont donc été appliquées une par une, de façon ciblée, après vérification.

**Correction à appliquer.** Aligner l'historique avec `supabase migration repair
--status applied <version>` pour chaque migration locale déjà en place, puis récupérer
les migrations distantes manquantes avec `supabase db pull`. À faire à froid, en
vérifiant migration par migration que le contenu correspond, jamais sous contrainte de
temps.
