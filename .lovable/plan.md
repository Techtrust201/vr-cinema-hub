## Objectif
Ajouter un flux "Mot de passe oublié" complet au dashboard, en français, cohérent avec le style VR existant (violet/cyan, glass).

## Flux utilisateur
1. Sur `/auth` (mode Connexion), un lien **"Mot de passe oublié ?"** sous le champ mot de passe.
2. Clic → page `/forgot-password` : saisie de l'email → envoi de `resetPasswordForEmail` avec `redirectTo = ${origin}/reset-password`.
3. L'utilisateur reçoit un email (template par défaut Lovable), clique → arrive sur `/reset-password`.
4. Page `/reset-password` : détecte le `type=recovery` dans l'URL, affiche un formulaire "nouveau mot de passe" + confirmation → `supabase.auth.updateUser({ password })` → redirection vers `/`.

## Modifications techniques

### `src/pages/Auth.tsx`
- Ajouter un lien "Mot de passe oublié ?" (visible seulement en mode `signin`) qui pointe vers `/forgot-password`.

### `src/pages/ForgotPassword.tsx` (nouveau)
- Formulaire email + bouton "Envoyer le lien".
- Appel `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`.
- Toast succès + message de confirmation à l'écran ("Vérifiez votre boîte mail").
- Lien retour vers `/auth`.

### `src/pages/ResetPassword.tsx` (nouveau)
- Route **publique** (hors `ProtectedRoute`).
- Écoute `onAuthStateChange` pour capter l'event `PASSWORD_RECOVERY` (Supabase pose la session automatiquement depuis le hash).
- Formulaire : nouveau mot de passe + confirmation, validation `min 8` + égalité.
- `supabase.auth.updateUser({ password })` → toast succès → `navigate('/')`.
- Si aucune session recovery détectée : afficher un message d'erreur + lien vers `/forgot-password`.

### `src/App.tsx`
- Ajouter deux routes publiques (hors `ProtectedRoute`) : `/forgot-password` et `/reset-password`.

## Hors périmètre
- Pas de customisation des templates email (les emails par défaut Lovable suffisent).
- Pas de changement du provider auth ni des règles RLS.
- Le rate limit auth reste inchangé sauf si tu rencontres un HTTP 429.
