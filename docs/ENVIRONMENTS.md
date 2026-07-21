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
| **PRODUCTION VERCEL** | `https://vr-cinema-hub.vercel.app` | `https://fllhnbeukuwrvserebqn.supabase.co` | `fllhnbeukuwrvserebqn` | `com.techtrust.vrcinemaquest` | Cible active post-cutover |
| **LegacyReadOnly** | — | `https://eanocqzhvlpgppccfppi.supabase.co` | `eanocqzhvlpgppccfppi` | — | Rollback seulement, jamais sélectionné |

## Utilisateurs — où ils existent

| Identité | Backend Lovable (`eanocq…`) | Backend autonome (`fllhn…`) |
|----------|-----------------------------|-----------------------------|
| Compte Alexandre | Probablement oui (créé via Vercel) | **Non** (absent au dernier audit) |
| `contact@tech-trust.fr` / TechTrust | À vérifier | Oui — seul compte staging (admin, puis owner bootstrap si migration appliquée) |
| Données vidéos historiques | Oui | Non (jeu E2E/QA seulement) |

## Cutover

Autorisé : `main` web → Vercel production → Supabase `fllhnbeukuwrvserebqn`.  
L’ancien projet Lovable reste documenté uniquement comme **LegacyReadOnly**.

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
