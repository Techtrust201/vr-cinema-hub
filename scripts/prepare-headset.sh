#!/usr/bin/env bash
# Prépare un casque neuf pour l'exploitation : installe l'application et accorde
# d'avance les autorisations, pour que le client n'ait jamais de fenêtre à lire.
#
# Usage :
#   scripts/prepare-headset.sh                       # tous les casques branchés
#   scripts/prepare-headset.sh chemin/vers/app.apk   # avec un APK précis
#   scripts/prepare-headset.sh --check               # vérifie sans rien installer
#
# Pourquoi accorder les autorisations ici : le greffon OpenXR d'Unity réclame
# l'accès au suivi oculaire dès que le rendu fovéal est activé, sans vérifier
# que le casque en est capable. Le Quest 3 n'a pas de capteurs oculaires, donc
# la fenêtre s'affiche pour une fonction qui ne marchera jamais — et elle bloque
# le premier démarrage jusqu'à ce que quelqu'un enfile le casque et réponde.
#
# Unity n'expose aucun réglage pour l'éviter sans perdre aussi le rendu fovéal
# fixe, qui lui fonctionne et compense la résolution augmentée. Mais il vérifie
# d'abord si l'autorisation est déjà donnée : l'accorder par câble pendant la
# préparation suffit à ne plus jamais voir la fenêtre, sans rien dégrader.
set -euo pipefail

PKG="com.techtrust.vrcinemaquest"
DEFAULT_APK="vr-cinema-quest-app-unity/builds/VR-Cinema-Quest-PRODUCTION.apk"

# Les deux familles de noms coexistent selon la version d'Horizon OS. Aucune
# n'est indispensable : on tente les deux et on n'échoue pas sur une absence.
PERMISSIONS=(
  "com.oculus.permission.EYE_TRACKING"
  "horizonos.permission.EYE_TRACKING"
  "android.permission.EYE_TRACKING_FINE"
  "android.permission.EYE_TRACKING_COARSE"
)

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
check_only=0
apk=""

for arg in "$@"; do
  case "$arg" in
    --check) check_only=1 ;;
    -h|--help) sed -n '2,19p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) apk="$arg" ;;
  esac
done

command -v adb >/dev/null 2>&1 || { echo "adb introuvable. Installe les outils plateforme Android." >&2; exit 1; }

if [[ -z "$apk" ]]; then
  apk="${ROOT}/${DEFAULT_APK}"
fi

if [[ "$check_only" -eq 0 && ! -f "$apk" ]]; then
  echo "APK introuvable : $apk" >&2
  echo "Construis-le d'abord, ou donne son chemin en argument." >&2
  exit 1
fi

mapfile -t serials < <(adb devices | awk 'NR>1 && $2=="device"{print $1}')
if [[ ${#serials[@]} -eq 0 ]]; then
  echo "Aucun casque détecté. Branche-le en USB et accepte le débogage sur l'écran du casque." >&2
  exit 1
fi

echo "${#serials[@]} casque(s) détecté(s)."
[[ "$check_only" -eq 0 ]] && echo "APK : $apk"
echo

failures=0

for serial in "${serials[@]}"; do
  model=$(adb -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
  echo "── ${model:-casque} (${serial})"

  if [[ "$check_only" -eq 0 ]]; then
    if adb -s "$serial" install -r -g "$apk" >/dev/null 2>&1; then
      echo "   application installée"
    else
      # -g demande toutes les autorisations d'un coup ; certaines versions
      # d'Horizon OS le refusent. Réessayer sans, les autorisations étant
      # accordées une à une juste après.
      if adb -s "$serial" install -r "$apk" >/dev/null 2>&1; then
        echo "   application installée"
      else
        echo "   ÉCHEC de l'installation" >&2
        failures=$((failures + 1))
        continue
      fi
    fi
  fi

  if ! adb -s "$serial" shell pm path "$PKG" >/dev/null 2>&1; then
    echo "   application absente de ce casque" >&2
    failures=$((failures + 1))
    continue
  fi

  granted=0
  for perm in "${PERMISSIONS[@]}"; do
    adb -s "$serial" shell pm grant "$PKG" "$perm" >/dev/null 2>&1 && granted=$((granted + 1)) || true
  done

  # Ce que le système retient réellement, pas ce qu'on a demandé : une
  # autorisation inconnue d'Horizon OS est refusée sans le dire.
  if adb -s "$serial" shell dumpsys package "$PKG" 2>/dev/null \
      | grep -qE 'EYE_TRACKING.*granted=true'; then
    echo "   suivi oculaire accordé — aucune fenêtre au démarrage"
  else
    echo "   ATTENTION : aucune autorisation de suivi oculaire retenue." >&2
    echo "   La fenêtre risque d'apparaître au premier lancement." >&2
    failures=$((failures + 1))
  fi

  version=$(adb -s "$serial" shell dumpsys package "$PKG" 2>/dev/null \
    | sed -n 's/.*versionName=\([^ ]*\).*/\1/p' | head -1 | tr -d '\r')
  echo "   version installée : ${version:-inconnue}"
  echo
done

if [[ "$failures" -gt 0 ]]; then
  echo "${failures} casque(s) à reprendre." >&2
  exit 1
fi

echo "Casques prêts. Ils peuvent être livrés tels quels."
