#!/usr/bin/env bash
# Construit l'application casque et la publie sur le site : après ce script, le bouton
# « Télécharger » de la page Casques donne cette version.
#
# Usage :
#   scripts/release-headset-app.sh                        # build + publication
#   scripts/release-headset-app.sh --notes "Axe 360 corrigé"
#   scripts/release-headset-app.sh --dry-run              # build + contrôles, rien n'est publié
#   scripts/release-headset-app.sh --skip-build           # publie builds/DLPAlexandre.apk tel quel
#
# Ce que le script garantit, et pourquoi :
#   - chaque APK publié correspond à un commit du dépôt Unity : il refuse de partir sur des
#     modifications non enregistrées, et enregistre lui-même le changement de version ;
#   - le numéro de version Android augmente toujours, sinon le casque refuse la mise à jour ;
#   - l'APK est signé par la même clé que les versions déjà installées. Une autre clé rendrait
#     la mise à jour impossible sans désinstaller, ce qui efface les films et l'appairage ;
#   - le fichier est en place sur R2 avant que la base ne l'annonce : le lien du site n'est
#     jamais cassé, même si le script s'interrompt.
#
# Prérequis, une seule fois : SUPABASE_SECRET_KEY dans origin/.env (tableau de bord Supabase →
# Project Settings → API Keys → Secret keys). Les identifiants R2 y sont déjà.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
UNITY_PROJECT="$ROOT/vr-cinema-quest-app-unity"
SETTINGS="$UNITY_PROJECT/ProjectSettings/ProjectSettings.asset"
APK="$UNITY_PROJECT/builds/DLPAlexandre.apk"
PACKAGE="com.techtrust.vrcinemaquest"
LABEL="DLPAlexandre"

# Empreinte du certificat qui signe les versions installées sur les casques.
EXPECTED_SIGNER="21d80dbdf7c2a7db78891cdb6ff3551b36e81c2f6b94280bfa1d3c149439ac42"

UNITY_EDITOR="${UNITY_EDITOR:-$HOME/Unity/Hub/Editor/6000.3.17f1/Editor/Unity}"
ANDROID="${ANDROID_PLAYER:-$HOME/Unity/Hub/Editor/6000.3.17f1/Editor/Data/PlaybackEngines/AndroidPlayer}"
BUILD_TOOLS="$(find "$ANDROID/SDK/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
export JAVA_HOME="${JAVA_HOME:-$ANDROID/OpenJDK}"
export PATH="$JAVA_HOME/bin:$PATH"
RCLONE="${RCLONE:-$HOME/.local/bin/rclone}"

dry_run=0
skip_build=0
notes=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    --skip-build) skip_build=1 ;;
    --notes) notes="${2:-}"; shift ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "ERREUR : $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

# --- Identifiants -------------------------------------------------------------------------

env_value() {
  # $1 = fichier, $2 = nom de variable
  [[ -f "$1" ]] || return 0
  sed -n "s/^$2=//p" "$1" | tail -1 | tr -d '\r'
}

R2_ENDPOINT="${R2_ENDPOINT:-$(env_value "$ROOT/origin/.env" R2_ENDPOINT)}"
R2_BUCKET="${R2_BUCKET:-$(env_value "$ROOT/origin/.env" R2_BUCKET)}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-$(env_value "$ROOT/origin/.env" R2_ACCESS_KEY_ID)}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-$(env_value "$ROOT/origin/.env" R2_SECRET_ACCESS_KEY)}"
SUPABASE_URL="${SUPABASE_URL:-$(env_value "$ROOT/.env" VITE_SUPABASE_URL | tr -d '"')}"
SUPABASE_SECRET_KEY="${SUPABASE_SECRET_KEY:-$(env_value "$ROOT/origin/.env" SUPABASE_SECRET_KEY)}"

if [[ $dry_run -eq 0 ]]; then
  for var in R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY SUPABASE_URL; do
    [[ -n "${!var}" ]] || die "$var introuvable (origin/.env ou .env)."
  done
  [[ -n "$SUPABASE_SECRET_KEY" ]] || die "SUPABASE_SECRET_KEY absente de origin/.env.
  Tableau de bord Supabase → Project Settings → API Keys → Secret keys, puis ajouter la ligne
  SUPABASE_SECRET_KEY=sb_secret_… dans origin/.env (ce fichier n'est pas versionné)."
  [[ -x "$RCLONE" ]] || die "rclone introuvable ($RCLONE)."
fi

rest() {
  # $1 = méthode, $2 = chemin REST, $3 = corps JSON facultatif
  local auth=()
  # Une clé de service historique est un JWT et se passe aussi en Authorization ; une clé
  # secrète récente ne se passe que dans apikey.
  [[ "$SUPABASE_SECRET_KEY" == eyJ* ]] && auth=(-H "Authorization: Bearer $SUPABASE_SECRET_KEY")
  curl -fsS -X "$1" "$SUPABASE_URL/rest/v1/$2" \
    -H "apikey: $SUPABASE_SECRET_KEY" "${auth[@]}" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    ${3:+--data "$3"}
}

r2() {
  RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" \
    "$RCLONE" "$@"
}

setting() { sed -n "s/^  $1: //p" "$SETTINGS" | head -1; }

# --- 1. Dépôt Unity propre ----------------------------------------------------------------

step "Dépôt Unity"
dirty=$(git -C "$UNITY_PROJECT" status --porcelain)
[[ -z "$dirty" ]] || die "modifications non commitées dans vr-cinema-quest-app-unity :
$dirty
Chaque APK publié doit correspondre à un commit. Commitez ou mettez de côté, puis relancez."
echo "propre, commit $(git -C "$UNITY_PROJECT" rev-parse --short HEAD)"

# --- 2. Numéro de version ------------------------------------------------------------------

step "Version"
version_name=$(setting bundleVersion)
version_code=$(setting AndroidBundleVersionCode)
[[ "$version_name" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "bundleVersion inattendu : '$version_name'"
[[ "$version_code" =~ ^[0-9]+$ ]] || die "AndroidBundleVersionCode inattendu : '$version_code'"

latest_code=0
latest_name=""
if [[ $dry_run -eq 0 ]]; then
  latest=$(rest GET "app_releases?select=version_code,version_name&order=version_code.desc&limit=1") \
    || die "lecture de app_releases impossible (migration appliquée ? clé valide ?)"
  latest_code=$(jq -r '.[0].version_code // 0' <<<"$latest")
  latest_name=$(jq -r '.[0].version_name // ""' <<<"$latest")
fi

if [[ $skip_build -eq 1 ]]; then
  echo "publication de l'APK existant, version lue dans le fichier"
else
  next_code=$(( (version_code > latest_code ? version_code : latest_code) + 1 ))
  # Un même nom pour deux builds empêcherait de repérer les casques à mettre à jour, qui ne
  # remontent que ce nom.
  if [[ "$version_name" == "$latest_name" ]]; then
    IFS=. read -r major minor patch <<<"$version_name"
    version_name="$major.$minor.$((patch + 1))"
    echo "le nom $latest_name est déjà publié : passage à $version_name"
  fi
  sed -i "s/^  bundleVersion: .*/  bundleVersion: $version_name/; s/^  AndroidBundleVersionCode: .*/  AndroidBundleVersionCode: $next_code/" "$SETTINGS"
  version_code=$next_code
  echo "$version_name (versionCode $version_code, dernier publié : ${latest_code})"
fi

restore_settings() {
  git -C "$UNITY_PROJECT" checkout -- ProjectSettings/ProjectSettings.asset 2>/dev/null || true
}

# --- 3. Build -----------------------------------------------------------------------------

if [[ $skip_build -eq 0 ]]; then
  step "Build Unity (plusieurs minutes)"
  [[ -x "$UNITY_EDITOR" ]] || { restore_settings; die "éditeur Unity introuvable : $UNITY_EDITOR"; }
  if [[ -e "$UNITY_PROJECT/Temp/UnityLockfile" ]] && fuser "$UNITY_PROJECT/Temp/UnityLockfile" >/dev/null 2>&1; then
    restore_settings
    die "le projet est ouvert dans l'éditeur Unity. Fermez-le, puis relancez."
  fi
  log="/tmp/dlpalexandre-build-$version_code.log"
  started=$(date +%s)
  if ! "$UNITY_EDITOR" -batchmode -quit -nographics -projectPath "$UNITY_PROJECT" \
       -executeMethod CommandLineBuild.BuildAndroidProduction -logFile "$log"; then
    restore_settings
    rg -n "error|Error|Exception" "$log" 2>/dev/null | tail -20 || tail -40 "$log"
    die "build échoué, journal complet : $log"
  fi
  [[ -f "$APK" && $(stat -c %Y "$APK") -ge $started ]] || { restore_settings; die "APK absent ou non régénéré : $APK"; }
  echo "journal : $log"
  # L'éditeur réécrit parfois d'autres fichiers en se fermant. Ils ne font pas partie de la
  # version, mais bloqueraient la publication suivante : mieux vaut le savoir maintenant.
  others=$(git -C "$UNITY_PROJECT" status --porcelain | grep -v ' ProjectSettings/ProjectSettings.asset$' || true)
  [[ -z "$others" ]] || echo "ATTENTION, fichiers modifiés par l'éditeur (non inclus) :
$others"
fi

# --- 4. Contrôles de l'APK ----------------------------------------------------------------

step "Contrôle de l'APK"
[[ -f "$APK" ]] || die "APK introuvable : $APK"
badging=$("$BUILD_TOOLS/aapt2" dump badging "$APK")
apk_package=$(sed -n "s/^package: name='\([^']*\)'.*/\1/p" <<<"$badging")
apk_code=$(sed -n "s/^package: .*versionCode='\([0-9]*\)'.*/\1/p" <<<"$badging")
apk_name=$(sed -n "s/^package: .*versionName='\([^']*\)'.*/\1/p" <<<"$badging")
apk_label=$(sed -n "s/^application-label:'\(.*\)'$/\1/p" <<<"$badging")
signer=$("$BUILD_TOOLS/apksigner" verify --print-certs "$APK" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p')

echo "package=$apk_package versionCode=$apk_code versionName=$apk_name nom=$apk_label"
echo "signature=$signer"

fail() { [[ $skip_build -eq 0 ]] && restore_settings; die "$@"; }
[[ "$apk_package" == "$PACKAGE" ]] || fail "package $apk_package au lieu de $PACKAGE : ce ne serait pas une mise à jour mais une seconde application."
[[ "$apk_label" == "$LABEL" ]] || fail "nom affiché « $apk_label » au lieu de « $LABEL »."
[[ "$signer" == "$EXPECTED_SIGNER" ]] || fail "APK signé par une autre clé ($signer).
Les casques refuseraient la mise à jour. Restaurez ~/.android/debug.keystore depuis la sauvegarde."
if [[ $skip_build -eq 0 ]]; then
  [[ "$apk_code" == "$version_code" ]] || fail "versionCode $apk_code dans l'APK, $version_code attendu."
else
  version_code=$apk_code
  version_name=$apk_name
fi
(( version_code > latest_code )) || fail "versionCode $version_code ≤ dernier publié $latest_code : le casque refuserait la mise à jour."

size=$(stat -c %s "$APK")
sha=$(sha256sum "$APK" | cut -d' ' -f1)
key="releases/DLPAlexandre-$version_name-vc$version_code.apk"
echo "taille=$size sha256=$sha"

if [[ $dry_run -eq 1 ]]; then
  [[ $skip_build -eq 0 ]] && restore_settings
  step "Essai à blanc : rien n'est publié"
  echo "aurait envoyé $key et annoncé $version_name (versionCode $version_code)."
  exit 0
fi

# --- 5. Commit de la version --------------------------------------------------------------

commit=$(git -C "$UNITY_PROJECT" rev-parse HEAD)
if [[ $skip_build -eq 0 ]]; then
  step "Commit de la version"
  git -C "$UNITY_PROJECT" add ProjectSettings/ProjectSettings.asset
  git -C "$UNITY_PROJECT" commit -q -m "Publier la version $version_name du casque (versionCode $version_code)."
  commit=$(git -C "$UNITY_PROJECT" rev-parse HEAD)
  echo "$(git -C "$UNITY_PROJECT" log -1 --oneline)"
fi

# --- 6. Envoi sur R2, puis annonce --------------------------------------------------------

step "Envoi sur R2 : $key"
r2 copyto "$APK" "R2:$R2_BUCKET/$key" --s3-no-check-bucket --s3-chunk-size 32M
remote_size=$(r2 lsjson "R2:$R2_BUCKET/$key" | jq -r '.[0].Size // 0')
[[ "$remote_size" == "$size" ]] || die "taille sur R2 ($remote_size) différente du fichier ($size)."
echo "en place, $remote_size octets"

step "Annonce sur le site"
body=$(jq -n \
  --arg version_name "$version_name" --argjson version_code "$version_code" \
  --arg storage_path "$key" --argjson size_bytes "$size" --arg sha256 "$sha" \
  --arg signer_sha256 "$signer" --arg git_commit "$commit" --arg notes "$notes" \
  '{version_name: $version_name, version_code: $version_code, storage_path: $storage_path,
    size_bytes: $size_bytes, sha256: $sha256, signer_sha256: $signer_sha256,
    git_commit: $git_commit, notes: (if $notes == "" then null else $notes end)}')
rest POST "app_releases" "$body" | jq -r '.[0] | "publiée : \(.version_name) (versionCode \(.version_code)) le \(.created_at)"'

echo
echo "Le bouton « Télécharger » de la page Casques propose désormais cette version."
echo "Pensez à pousser le dépôt Unity : git -C vr-cinema-quest-app-unity push"
