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

## Ce qui n'est pas encore isolé

Le dashboard Vercel et l'APK production parlent au **même** projet Supabase `fllhnbeukuwrvserebqn`. L'APK staging (`com.techtrust.vrcinemaquest.staging`) aussi, via un `EnvironmentId` différent côté casque — ce n'est pas un backend séparé.

Un vrai staging isolé (second projet Supabase, clés distinctes, données client intouchables) n'existe pas encore. Ne pas le créer pendant une séance client : c'est un cutover à part, avec un nouveau projet et un rebuild Unity `VR_BACKEND_STAGING`.

Les secrets dashboard vivent dans `.env` local (ignoré par git) et dans Vercel. Copier `.env.example` pour un nouveau clone.

## CI

GitHub Actions (`.github/workflows/ci.yml`) couvre le dashboard : install, build, `tsc`, tests, lint.

Il n'y a **pas** de CI APK : IL2CPP demande une licence Unity et une machine qui tient ~10 min / ~8 Go. Le binaire Quest se construit en local (`CommandLineBuild.BuildAndroidProduction`).


## Rôles (nouveau backend)

| Rôle | Droits |
|------|--------|
| owner | gouvernance, transfert propriété, audit complet |
| admin | membres (hors owner), contenu |
| operator | contenu uniquement |

Edge Function : `invite-org-member` (invitation + attribution de rôle).
