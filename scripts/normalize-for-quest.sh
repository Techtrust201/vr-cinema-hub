#!/usr/bin/env bash
# Normalise des vidéos vers le profil que le décodeur du Quest accepte de façon
# fiable via Unity VideoPlayer : H.264 High, yuv420p, AAC, mp4.
#
# Les sources livrées par les clients sortent de Skybox / caméras 360 et sont
# régulièrement indécodables telles quelles :
#   - VP9        : aucun décodeur exposé à Unity VideoPlayer sur Horizon OS ;
#   - HEVC .MOV  : conteneur + codec mal gérés, image noire avec audio correct.
#
# Symptôme commun : la barre de lecture avance, l'image reste noire.
#
# COMBIEN DE DÉFINITION VISER, ET POURQUOI CE N'EST PAS LA MÊME SELON L'IMAGE
#
# Ce qui décide de la netteté ressentie n'est pas la définition du fichier, mais
# le nombre de pixels qui tombent dans un degré du champ de vision. L'écran du
# Quest 3 en affiche une vingtaine par degré.
#
#   - Écran plat  : l'image occupe ~50°, donc 3840 px y donnent ~70 px/degré.
#                   Très au-delà de ce que la dalle montre : 4K suffit largement,
#                   et monter plus haut ne gonflerait que le fichier.
#   - 360         : les mêmes 3840 px sont étalés sur 360°, soit 10,7 px/degré —
#                   la moitié de ce que l'écran peut rendre, d'où une image molle
#                   quoi qu'on fasse côté application. Il faut 7680 de large pour
#                   atteindre 21 px/degré et retrouver la netteté d'un écran plat.
#   - 360 relief  : en haut/bas, chaque œil ne reçoit que la moitié des lignes.
#                   C'est le cas le plus exigeant : viser 7680x7680 si la source
#                   le permet, sinon accepter une image en retrait.
#
# Le plafond de 4K appliqué ici auparavant venait d'une limite supposée du
# décodeur. C'était faux : le Quest 3 annonce H.264 et HEVC jusqu'à 8192x8192
# (vérifiable dans les traces au démarrage, « Décodeurs matériels »). La 8K passe
# donc, et c'est le seul vrai levier de netteté pour une vidéo 360.
#
# Aucun agrandissement n'est jamais pratiqué : une source 4K reste en 4K, car
# interpoler des pixels n'ajoute aucun détail. Viser la 8K suppose de l'exporter
# en 8K depuis l'outil d'origine.
#
# Usage : scripts/normalize-for-quest.sh <sortie_dir> <fichier...>
#   PROJECTION=flat scripts/normalize-for-quest.sh out/ film.mov   # cible 4K
#   PROJECTION=360  scripts/normalize-for-quest.sh out/ film.mp4   # cible 8K
set -euo pipefail

# Le décodeur matériel du Quest 3 accepte 8192x8192. On s'arrête à 7680 de large,
# définition 8K usuelle des exports 360, qui laisse une marge au conteneur.
case "${PROJECTION:-360}" in
  flat|plat)
    MAX_WIDTH=3840
    MAX_HEIGHT=2160
    ;;
  *)
    MAX_WIDTH=7680
    MAX_HEIGHT=4320
    ;;
esac
# QP 26 était trop agressif : en 360 les pixels sont étalés sur la sphère, et le
# résultat paraissait compressé. 18 reste rapide en VAAPI tout en restant net.
QP="${QP:-18}"
# CRF 16 : quasi transparent pour une source 4K. Le fichier gonfle, le Quest s'en fiche.
CRF="${CRF:-16}"

usage() {
  echo "Usage: $0 <sortie_dir> <fichier...>" >&2
  exit 2
}

[[ $# -ge 2 ]] || usage
command -v ffmpeg >/dev/null || { echo "ffmpeg introuvable" >&2; exit 1; }

OUT_DIR="$1"; shift
mkdir -p "$OUT_DIR"

# Le driver VAAPI de cette machine n'expose que CQP : un -b:v ferait échouer
# l'ouverture de l'encodeur. Repli logiciel si le GPU n'est pas exploitable.
vaapi_ok=0
if [[ -e /dev/dri/renderD128 ]] && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q h264_vaapi; then
  vaapi_ok=1
fi

encode() {
  local src="$1" dst="$2" w="$3" h="$4" sw="$5" sh="$6"
  local scale

  if (( sw == w && sh == h )); then
    # Redimensionner vers la taille d'origine ferait tourner le rééchantillonneur
    # en 4K pour rien : c'est le poste de coût dominant, loin devant l'encodeur.
    scale="format=nv12"
  else
    # bicubic plutôt que lanczos : à ces résolutions lanczos triple le temps de
    # calcul pour une différence invisible dans un casque.
    # Dimensions paires obligatoires en yuv420p ; certaines sources arrivent en
    # 3826x2152, que le décodeur refuse.
    scale="scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos"
    scale="${scale},pad=ceil(iw/2)*2:ceil(ih/2)*2,format=nv12"
  fi

  # HWDEC=0 garde le décodage sur le processeur. C'est plus rapide dès que les
  # cœurs sont libres : décoder et encoder sur le même GPU intégré le sature et
  # divise le débit par cinq, alors que le décodage logiciel exploite 4 cœurs
  # pendant que le GPU ne fait que l'encodage.
  if [[ $vaapi_ok -eq 1 && "${HWDEC:-1}" == "1" ]]; then
    local gpu_scale="scale_vaapi=format=nv12"
    if (( sw != w || sh != h )); then
      gpu_scale="scale_vaapi=w=${w}:h=${h}:format=nv12"
    fi

    if ffmpeg -hide_banner -loglevel warning -stats -y \
      -hwaccel vaapi -hwaccel_device /dev/dri/renderD128 -hwaccel_output_format vaapi \
      -i "$src" \
      -vf "$gpu_scale" \
      -c:v h264_vaapi -profile:v high -rc_mode CQP -qp "$QP" \
      -c:a aac -b:a 192k -ac 2 \
      -movflags +faststart "$dst" && [[ -s "$dst" ]]; then
      return 0
    fi

    # Tous les codecs ne sont pas décodables par ce GPU (le HEVC de certains
    # iPhone, par exemple) : on retombe sur un décodage logiciel.
    echo "   (décodage matériel refusé, repli logiciel)"
    ffmpeg -hide_banner -loglevel warning -stats -y \
      -vaapi_device /dev/dri/renderD128 \
      -i "$src" \
      -vf "${scale},hwupload" \
      -c:v h264_vaapi -profile:v high -rc_mode CQP -qp "$QP" \
      -c:a aac -b:a 192k -ac 2 \
      -movflags +faststart "$dst"
  else
    ffmpeg -hide_banner -loglevel warning -stats -y \
      -i "$src" \
      -vf "${scale/format=nv12/format=yuv420p}" \
      -c:v libx264 -profile:v high -preset fast -crf "$CRF" \
      -c:a aac -b:a 192k -ac 2 \
      -movflags +faststart "$dst"
  fi
}

for src in "$@"; do
  [[ -r "$src" ]] || { echo "illisible : $src" >&2; exit 1; }

  base=$(basename "$src")
  dst="${OUT_DIR}/${base%.*}.mp4"

  read -r codec width height < <(
    ffprobe -v error -select_streams v:0 \
      -show_entries stream=codec_name,width,height -of csv=p=0 "$src" | tr ',' ' '
  )

  # TARGET_W/TARGET_H permettent d'imposer la cible : une source plate n'a aucun
  # besoin de 4K sur un écran virtuel, et l'agrandir coûterait du débit pour rien.
  target_w=${TARGET_W:-$MAX_WIDTH}
  target_h=${TARGET_H:-$MAX_HEIGHT}

  # Jamais d'agrandissement : il gonfle le fichier sans ajouter de détail.
  if (( width < target_w )); then
    target_w=$width
    target_h=$height
  fi

  echo "── ${base}"
  echo "   source : ${codec} ${width}x${height}"
  echo "   cible  : h264 high ${target_w}x${target_h} crf${CRF}/qp${QP}"

  encode "$src" "$dst" "$target_w" "$target_h" "$width" "$height"

  echo "   écrit  : ${dst} ($(du -h "$dst" | cut -f1))"
  ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,profile,level,width,height,pix_fmt \
    -of default=noprint_wrappers=1 "$dst" | sed 's/^/          /'
done

echo "Terminé."
