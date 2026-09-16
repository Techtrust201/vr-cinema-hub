#!/usr/bin/env bash
# Transfère le contenu du nœud disque vers Cloudflare R2.
#
# L'arborescence est recopiée à l'identique : `videos.storage_path` reste valable
# tel quel, seule la colonne `origin` change. Un casque déjà synchronisé ne
# retéléchargera rien, puisqu'il valide ses fichiers locaux sur la taille.
#
# Les identifiants viennent de origin/.env, jamais de la ligne de commande :
# un secret passé en argument se retrouve dans l'historique du shell.
#
#   ./scripts/migrate-to-r2.sh            # transfert puis vérification
#   ./scripts/migrate-to-r2.sh --check    # vérification seule, aucun envoi
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

ENV_FILE="$ROOT/origin/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Introuvable : origin/.env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for var in R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "Variable manquante dans origin/.env : $var" >&2
    exit 1
  fi
done

RCLONE="${RCLONE:-$HOME/.local/bin/rclone}"
command -v "$RCLONE" >/dev/null 2>&1 || RCLONE=rclone
if ! command -v "$RCLONE" >/dev/null 2>&1; then
  echo "rclone introuvable. Installation : https://rclone.org/install/" >&2
  exit 1
fi

SRC="${ORIGIN_ROOT:-$ROOT/origin/data}"
SRC="${SRC%/}"
[[ -d "$SRC" ]] || { echo "Racine de l'origine disque introuvable : $SRC" >&2; exit 1; }

# rclone se configure entièrement par l'environnement : pas de fichier de config
# à créer, donc pas de secret qui traîne sur le disque après coup.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

DEST="R2:$R2_BUCKET"

# Les fichiers volumineux sont montés en lien symbolique vers leur source : sans
# --copy-links rclone enverrait le lien, pas le film.
COMMON=(--copy-links --exclude "_encoded/**" --exclude ".*" --s3-chunk-size 32M)

if [[ "${1:-}" == "--check" ]]; then
  echo "Vérification $SRC  ↔  $DEST"
  exec "$RCLONE" check "$SRC" "$DEST" "${COMMON[@]}" --size-only --progress
fi

echo "Transfert  $SRC  →  $DEST"
"$RCLONE" copy "$SRC" "$DEST" "${COMMON[@]}" --progress --transfers 3 --checkers 8

echo
echo "Vérification des tailles"
"$RCLONE" check "$SRC" "$DEST" "${COMMON[@]}" --size-only

echo
echo "Contenu du bucket :"
"$RCLONE" ls "$DEST" | sort -k2

cat <<'SQL'

Transfert terminé. Bascule de la base (les chemins ne changent pas) :

  UPDATE public.videos SET origin = 'r2' WHERE origin = 'disk';

SQL
