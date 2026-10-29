#!/usr/bin/env bash
# Fabrique une vidéo 360 dont chaque direction est écrite dans l'image, pour vérifier
# dans le casque qu'un film 360 est présenté dans le bon axe.
#
# Usage :
#   scripts/make-calibration-360.sh                 # écrit calibration-axe-360-mono.mp4
#   scripts/make-calibration-360.sh sortie.mp4
#
# Ce qu'on doit voir, casque sur la tête, au lancement :
#   - DEVANT (zone verte) face à soi ;
#   - DROITE (zone rouge) en tournant la tête à droite, GAUCHE (zone bleue) à gauche ;
#   - DERRIÈRE (zone grise) dans son dos ;
#   - la ligne jaune de l'horizon à hauteur des yeux, droite et non penchée.
# DROITE à gauche signale une image en miroir ; DEVANT sur le côté, un décalage.
#
# Le nom de fichier contient « 360 » et « mono » : le site reconnaît seul la géométrie à
# l'envoi. Des tirets, pas de soulignés, sinon « 360 » n'est pas lu comme un mot.
set -euo pipefail

sortie="${1:-calibration-axe-360-mono.mp4}"
largeur=3840
hauteur=1920
duree=30

police="$(fc-match -f '%{file}' 'DejaVu Sans:bold' 2>/dev/null || true)"
if [[ -z "$police" || ! -f "$police" ]]; then
  echo "Police introuvable (fc-match). Installer fonts-dejavu-core." >&2
  exit 1
fi

# Équirectangulaire : x = 0 et x = largeur sont l'arrière, le centre est l'avant,
# les trois quarts la droite. Un secteur de 90° vaut largeur/4 pixels.
q=$((largeur / 4))
h=$((q / 2))
milieu=$((hauteur / 2))

texte() {
  # $1 = texte, $2 = abscisse du centre, $3 = ordonnée du centre, $4 = taille
  printf "drawtext=fontfile=%s:text='%s':fontsize=%s:fontcolor=white:borderw=6:bordercolor=black:x=%s-text_w/2:y=%s-text_h/2" \
    "$police" "$1" "$4" "$2" "$3"
}

filtres=(
  "drawbox=x=0:y=0:w=${h}:h=${hauteur}:color=0x606060:t=fill"
  "drawbox=x=${h}:y=0:w=${q}:h=${hauteur}:color=0x1f4fbf:t=fill"
  "drawbox=x=$((h + q)):y=0:w=${q}:h=${hauteur}:color=0x0d8a42:t=fill"
  "drawbox=x=$((h + 2 * q)):y=0:w=${q}:h=${hauteur}:color=0xb42318:t=fill"
  "drawbox=x=$((h + 3 * q)):y=0:w=${h}:h=${hauteur}:color=0x606060:t=fill"
)

# Un trait vertical tous les 30°, pour juger l'écart d'un coup d'œil.
for i in $(seq 1 11); do
  filtres+=("drawbox=x=$((i * largeur / 12 - 2)):y=0:w=4:h=${hauteur}:color=white@0.6:t=fill")
done

filtres+=(
  "drawbox=x=0:y=$((milieu - 4)):w=${largeur}:h=8:color=yellow:t=fill"
  "$(texte 'DEVANT' $((2 * q)) $((milieu - 140)) 150)"
  "$(texte '0°' $((2 * q)) $((milieu + 120)) 100)"
  "$(texte 'DROITE' $((3 * q)) $((milieu - 140)) 150)"
  "$(texte '90° à droite' $((3 * q)) $((milieu + 120)) 80)"
  "$(texte 'GAUCHE' ${q} $((milieu - 140)) 150)"
  "$(texte '90° à gauche' ${q} $((milieu + 120)) 80)"
  "$(texte 'DERRIÈRE' $((h / 2)) $((milieu - 140)) 64)"
  "$(texte 'DERRIÈRE' $((largeur - h / 2)) $((milieu - 140)) 64)"
  "$(texte 'ciel' $((2 * q)) $((milieu - 520)) 90)"
  "$(texte 'sol' $((2 * q)) $((milieu + 480)) 90)"
  "drawtext=fontfile=${police}:text='%{pts\\:hms}':fontsize=80:fontcolor=white:borderw=4:bordercolor=black:x=$((2 * q))-text_w/2:y=$((milieu + 300))"
)

chaine="$(IFS=,; echo "${filtres[*]}")"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=black:s=${largeur}x${hauteur}:r=30:d=${duree}" \
  -f lavfi -i "anullsrc=r=48000:cl=stereo" \
  -vf "$chaine" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -preset veryfast -crf 20 \
  -c:a aac -b:a 64k -shortest -movflags +faststart \
  "$sortie"

echo "Écrit : $sortie"
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,duration -of default=nw=1 "$sortie"
