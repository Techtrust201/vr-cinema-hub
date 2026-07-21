# Environnements VR Cinema Hub

> Document de cadrage P0.8 — **aucun cutover production** sans accord explicite.

## Principe

Séparer toujours :

| Paramètre | Rôle |
|-----------|------|
| `DashboardPublicUrl` | URL que le client ouvre dans le navigateur |
| `BackendApiUrl` | URL Supabase réellement appelée (Auth, REST, Edge Functions, Storage) |
| `SupabaseProjectRef` | Identifiant projet Supabase |
| `EnvironmentId` | Namespace logique (stockage Quest, logs, isolation) |
| `AllowedRedirectOrigins` | Allowlist Auth / invitations |
| `AndroidApplicationId` | Package Quest |
| `StorageNamespace` | Dossier local Quest `backends/<EnvironmentId>/` |

Le dashboard et le backend sont **indépendants**.  
`http://127.0.0.1:5173` n’est **jamais** l’URL client définitive.

## Matrice actuelle (constat)

| Profil | DashboardPublicUrl | BackendApiUrl | Project ref | Quest package | Statut |
|--------|-------------------|---------------|-------------|---------------|--------|
| **DEVELOPMENT** | `http://127.0.0.1:5173` | `https://fllhnbeukuwrvserebqn.supabase.co` | `fllhnbeukuwrvserebqn` | `com.techtrust.vrcinemaquest.staging` | Actif (labo) |
| **PRODUCTION VERCEL (actuel)** | `https://vr-cinema-hub.vercel.app` | `https://eanocqzhvlpgppccfppi.supabase.co` | `eanocqzhvlpgppccfppi` (Lovable) | `com.techtrust.vrcinemaquest` | Actif côté client |
| **STAGING VERCEL** | preview branch `cutover/new-supabase-production` | `https://fllhnbeukuwrvserebqn.supabase.co` | `fllhnbeukuwrvserebqn` | `.staging` | **À préparer** |
| **PRODUCTION (cible cutover)** | `https://vr-cinema-hub.vercel.app` | `https://fllhnbeukuwrvserebqn.supabase.co` *(ou projet prod dédié)* | à valider | package prod | **Interdit sans accord** |

## Utilisateurs — où ils existent

| Identité | Backend Lovable (`eanocq…`) | Backend autonome (`fllhn…`) |
|----------|-----------------------------|-----------------------------|
| Compte Alexandre | Probablement oui (créé via Vercel) | **Non** (absent au dernier audit) |
| `contact@tech-trust.fr` / TechTrust | À vérifier | Oui — seul compte staging (admin, puis owner bootstrap si migration appliquée) |
| Données vidéos historiques | Oui | Non (jeu E2E/QA seulement) |

## Plan cutover (pas encore exécuté)

1. Préparer / déployer une **preview Vercel staging** pointant vers `fllhnbeukuwrvserebqn`.
2. Configurer Auth redirect allowlist : origines Vercel staging + prod (pas d’URL arbitraire).
3. Inviter Alexandre sur le **nouveau** backend (mot de passe non copié depuis Lovable).
4. Migrer ou re-uploader le contenu nécessaire (pas de sync aveugle de secrets).
5. Valider E2E sur preview Vercel + Quest staging.
6. **Cutover** `vr-cinema-hub.vercel.app` → nouveau backend **uniquement après accord**.

## Unity

Unity doit exposer séparément :

- `DashboardPublicUrl` : texte d’aide (« ouvrez le dashboard… ») — jamais pour les APIs device ;
- `BackendApiUrl` / `FunctionsBase` : heartbeat, pairing, manifest, reports → Supabase uniquement.

Aucun appel device vers `vr-cinema-hub.vercel.app`.


## Rôles (nouveau backend)

| Rôle | Droits |
|------|--------|
| owner | gouvernance, transfert propriété, audit complet |
| admin | membres (hors owner), contenu |
| operator | contenu uniquement |

Edge Function : `invite-org-member` (invitation + attribution de rôle).
